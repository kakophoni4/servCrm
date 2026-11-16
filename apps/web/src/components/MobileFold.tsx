'use client';
import { useEffect, useState, type ReactNode } from 'react';

export function MobileFold({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  if (!mobile) return <div className={className}>{children}</div>;
  return <details className={`mobile-fold ${className}`} onInvalidCapture={e => { e.currentTarget.open = true; }}>
    <summary>{title}</summary>
    <div className="mobile-fold-content">{children}</div>
  </details>;
}
