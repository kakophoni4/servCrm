'use client';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';

export function OrderReturnTracker(){
  const pathname=usePathname();
  const previous=useRef('');
  useEffect(()=>{
    const origin=previous.current;
    if(origin && origin.split(/[?#]/)[0]!==pathname && origin.split(/[?#]/)[0]!=='/orders/new' && pathname.startsWith('/orders/')){
      sessionStorage.setItem('return:'+pathname,origin);
    }
    previous.current=pathname+location.search+location.hash;
  },[pathname]);
  return null;
}
export function orderReturnPath(){
  const key='return:'+location.pathname;
  const saved=sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  const path=new URLSearchParams(location.search).get('returnTo')||saved;
  if(!path?.startsWith('/') || new URL(path,location.origin).origin!==location.origin)return '/orders';
  return path;
}
