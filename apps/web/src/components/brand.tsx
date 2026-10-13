import Image from 'next/image';
import Link from 'next/link';

/** Talkel's logo and name, linking home. */
export function Brand({ size = 32 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Talkel home">
      <Image src="/logo.png" alt="" width={size} height={size} priority />
      <span className="text-lg font-bold tracking-tight text-fg">Talkel</span>
    </Link>
  );
}
