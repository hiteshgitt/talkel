// Vector graphics, loaded only on app builds that include react-native-svg (see components/vector.tsx).
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export interface GaugeProps {
  value: number; // 0–100
  size: number;
  stroke: number;
  color: string;
  colorEnd: string;
  track: string;
}

/** Circular progress arc with a gradient stroke, starting at 12 o'clock. */
export function ScoreGauge({ value, size, stroke, color, colorEnd, track }: GaugeProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id="gauge" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} />
          <Stop offset="1" stopColor={colorEnd} />
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#gauge)"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - v / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export interface SparklineProps {
  values: readonly number[]; // 0–100, oldest first
  width: number;
  height: number;
  color: string;
}

/** Smooth line chart with a soft gradient fill underneath. */
export function Sparkline({ values, width, height, color }: SparklineProps) {
  if (values.length < 2) return null;
  const pad = 6;
  const min = Math.max(0, Math.min(...values) - 10);
  const max = Math.min(100, Math.max(...values) + 10);
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v: number) => pad + (1 - (v - min) / Math.max(1, max - min)) * (height - 2 * pad);
  let line = `M ${x(0)} ${y(values[0]!)}`;
  for (let i = 1; i < values.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2;
    line += ` C ${cx} ${y(values[i - 1]!)}, ${cx} ${y(values[i]!)}, ${x(i)} ${y(values[i]!)}`;
  }
  const area = `${line} L ${x(values.length - 1)} ${height} L ${x(0)} ${height} Z`;
  const last = values.length - 1;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#fill)" />
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={x(last)} cy={y(values[last]!)} r={5} fill={color} />
      <Circle cx={x(last)} cy={y(values[last]!)} r={9} fill={color} opacity={0.2} />
    </Svg>
  );
}

export interface BackdropProps {
  width: number;
  height: number;
  tint: string;
  /** 0–1: stronger in dark mode */
  strength: number;
}

/** Decorative scene behind a scenario banner: flowing waves, rings and a dot grid. */
export function SceneBackdrop({ width, height, tint, strength }: BackdropProps) {
  const w = width;
  const h = height;
  const dots = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      dots.push(<Circle key={`${row}-${col}`} cx={w * 0.08 + col * 14} cy={h * 0.14 + row * 14} r={1.8} fill={tint} opacity={0.35 * strength} />);
    }
  }
  return (
    <Svg width={w} height={h} style={{ position: 'absolute' }}>
      <Defs>
        <LinearGradient id="wave1" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={tint} stopOpacity={0.05 * strength} />
          <Stop offset="1" stopColor={tint} stopOpacity={0.35 * strength} />
        </LinearGradient>
        <LinearGradient id="wave2" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={tint} stopOpacity={0.25 * strength} />
          <Stop offset="1" stopColor={tint} stopOpacity={0.05 * strength} />
        </LinearGradient>
      </Defs>
      <Circle cx={w * 0.84} cy={h * 0.3} r={h * 0.62} fill="none" stroke={tint} strokeOpacity={0.18 * strength} strokeWidth={1.5} />
      <Circle cx={w * 0.84} cy={h * 0.3} r={h * 0.44} fill="none" stroke={tint} strokeOpacity={0.24 * strength} strokeWidth={1.5} />
      <Circle cx={w * 0.84} cy={h * 0.3} r={h * 0.27} fill={tint} fillOpacity={0.16 * strength} />
      <Path d={`M0 ${h * 0.72} C ${w * 0.3} ${h * 0.55}, ${w * 0.55} ${h * 0.95}, ${w} ${h * 0.68} L ${w} ${h} L 0 ${h} Z`} fill="url(#wave1)" />
      <Path d={`M0 ${h * 0.85} C ${w * 0.35} ${h * 0.7}, ${w * 0.6} ${h * 1.02}, ${w} ${h * 0.82} L ${w} ${h} L 0 ${h} Z`} fill="url(#wave2)" />
      {dots}
    </Svg>
  );
}
