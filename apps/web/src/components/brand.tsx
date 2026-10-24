import Image from 'next/image';
import Link from 'next/link';

/** Talkel's logo and name, linking home. */
export function Brand({ size = 32 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Talkel home">
      <Image src="/logo-mark.png" alt="" width={size} height={size} priority />
      <span className="font-display text-[1.05rem] font-medium tracking-tight text-fg">Talkel</span>
    </Link>
  );
}
