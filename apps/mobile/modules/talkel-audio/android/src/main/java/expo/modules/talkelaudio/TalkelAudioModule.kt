package expo.modules.talkelaudio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.math.sqrt

private const val MIC_RATE = 16_000
private const val SPEAKER_RATE = 24_000
/** Mic audio is sent to JS in 40 ms chunks (2 bytes per sample). */
private const val MIC_CHUNK_BYTES = MIC_RATE / 1000 * 40 * 2
/** AI audio is written to the speaker in 20 ms pieces, so barge-in stops it within ~20 ms. */
private const val SPEAKER_PIECE_BYTES = SPEAKER_RATE / 1000 * 20 * 2

/**
 * Phone-call audio for talking to Gemini Live directly: the microphone as 16 kHz PCM (with the
 * platform's echo cancellation, noise suppression and gain control, so the AI doesn't hear itself
 * on speakerphone) and a streaming 24 kHz PCM player. Routing (earpiece, speaker, Bluetooth) is the
 * communication-mode routing that InCallManager sets up.
 */
class TalkelAudioModule : Module() {
  private var record: AudioRecord? = null
  private var track: AudioTrack? = null
  private var micThread: Thread? = null
  private var speakerThread: Thread? = null
  private val effects = mutableListOf<android.media.audiofx.AudioEffect>()
  private val queue = LinkedBlockingQueue<ByteArray>()
  private val lock = Object()

  @Volatile private var running = false
  /** Bumped by clear(): pieces from an older generation are dropped. */
  @Volatile private var generation = 0
  @Volatile private var playing = false
  private var framesWritten = 0L

  override fun definition() = ModuleDefinition {
    Name("TalkelAudio")
    Events("onMic", "onPlayback")

    AsyncFunction<Unit>("start") {
      start()
    }

    Function("play") { base64: String ->
      if (running) queue.offer(Base64.decode(base64, Base64.DEFAULT))
      Unit
    }

    /** Barge-in: drop everything queued or buffered. */
    Function<Unit>("clear") {
      clear()
    }

    AsyncFunction<Unit>("stop") {
      stop()
    }

    OnDestroy {
      stop()
    }
  }

  private fun start() {
    if (running) return
    val minRec = AudioRecord.getMinBufferSize(MIC_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val rec = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      MIC_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minRec, MIC_CHUNK_BYTES * 4),
    )
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw IllegalStateException("Microphone is not available")
    }
    val session = rec.audioSessionId
    if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(session)?.let { it.setEnabled(true); effects.add(it) }
    if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(session)?.let { it.setEnabled(true); effects.add(it) }
    if (AutomaticGainControl.isAvailable()) AutomaticGainControl.create(session)?.let { it.setEnabled(true); effects.add(it) }

    val minTrack = AudioTrack.getMinBufferSize(SPEAKER_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val out = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(SPEAKER_RATE)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build(),
      )
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setBufferSizeInBytes(maxOf(minTrack, SPEAKER_PIECE_BYTES * 8))
      .build()

    record = rec
    track = out
    queue.clear()
    framesWritten = 0
    playing = false
    running = true
    rec.startRecording()
    out.play()

    micThread = Thread({ micLoop(rec) }, "talkel-mic").also { it.start() }
    speakerThread = Thread({ speakerLoop(out) }, "talkel-speaker").also { it.start() }
  }

  private fun micLoop(rec: AudioRecord) {
    android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
    val buf = ByteArray(MIC_CHUNK_BYTES)
    while (running) {
      var filled = 0
      while (running && filled < buf.size) {
        val n = rec.read(buf, filled, buf.size - filled)
        if (n <= 0) break
        filled += n
      }
      if (!running || filled < buf.size) {
        if (running) Thread.sleep(5)
        continue
      }
      sendEvent("onMic", mapOf("data" to Base64.encodeToString(buf, Base64.NO_WRAP), "level" to rms(buf)))
    }
  }

  private fun speakerLoop(out: AudioTrack) {
    android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
    while (running) {
      val chunk = queue.poll(30, TimeUnit.MILLISECONDS)
      if (chunk == null) {
        // Nothing queued: report "stopped" once what was written has actually been heard.
        synchronized(lock) {
          if (playing && (out.playbackHeadPosition.toLong() and 0xffffffffL) >= framesWritten) setPlaying(false)
        }
        continue
      }
      val gen = generation
      synchronized(lock) { if (!playing && gen == generation) setPlaying(true) }
      var offset = 0
      while (running && offset < chunk.size && gen == generation) {
        val len = minOf(SPEAKER_PIECE_BYTES, chunk.size - offset)
        val n = out.write(chunk, offset, len)
        if (n <= 0) break
        synchronized(lock) { if (gen == generation) framesWritten += n / 2 }
        offset += n
      }
    }
  }

  private fun clear() {
    val out = track ?: return
    synchronized(lock) {
      generation++
      queue.clear()
      try {
        out.pause()
        out.flush()
        out.play()
      } catch (_: IllegalStateException) {
      }
      framesWritten = 0
      if (playing) setPlaying(false)
    }
  }

  private fun setPlaying(on: Boolean) {
    playing = on
    sendEvent("onPlayback", mapOf("state" to if (on) "started" else "stopped"))
  }

  private fun stop() {
    if (!running && record == null) return
    running = false
    generation++
    queue.clear()
    micThread?.join(500)
    speakerThread?.join(500)
    micThread = null
    speakerThread = null
    record?.let {
      try { it.stop() } catch (_: IllegalStateException) {}
      it.release()
    }
    record = null
    track?.let {
      try { it.pause(); it.flush(); it.stop() } catch (_: IllegalStateException) {}
      it.release()
    }
    track = null
    for (e in effects) e.release()
    effects.clear()
    playing = false
  }

  private fun rms(buf: ByteArray): Double {
    var sum = 0.0
    val samples = buf.size / 2
    for (i in 0 until samples) {
      val s = ((buf[2 * i + 1].toInt() shl 8) or (buf[2 * i].toInt() and 0xff)).toShort() / 32768.0
      sum += s * s
    }
    return sqrt(sum / samples)
  }
}
