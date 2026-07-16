'use client';

import {
  TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
}

/** Textarea без ручного resize — высота подстраивается под текст. */
export function AutoTextarea({ value, onChange, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    fitHeight(ref.current);
  }, [value]);

  useEffect(() => {
    const onResize = () => fitHeight(ref.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      className={['auto-textarea', className].filter(Boolean).join(' ')}
      style={{ resize: 'none', overflow: 'hidden', ...(rest.style ?? {}) }}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        requestAnimationFrame(() => fitHeight(ref.current));
      }}
    />
  );
}
