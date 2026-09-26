import clsx from 'clsx';

// Kotka's gold-wing mark (generated from public/Logo main.jpeg).
export default function BrandMark({ size = 32, className }) {
  return (
    <img
      src="/brand/kotka-mark-128.png"
      srcSet="/brand/kotka-mark-128.png 1x, /brand/kotka-mark.png 4x"
      width={size}
      height={size}
      alt="Kotka Trading"
      className={clsx('shrink-0 rounded-full', className)}
      style={{ width: size, height: size }}
    />
  );
}
