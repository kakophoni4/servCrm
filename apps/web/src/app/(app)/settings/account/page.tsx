'use client';

import Link from 'next/link';
import {getStoredUser} from '@/lib/api';
import {useEffect,useState} from 'react';
import { AccountSettingsPanel } from '@/components/settings/AccountSettingsPanel';

export default function AccountSettingsPage() {
  const [owner,setOwner]=useState(false);useEffect(()=>setOwner(getStoredUser()?.role==='OWNER'),[]);
  return (
    <div className="settings-page account-page">
      <h1 className="page-title settings-page-title">Аккаунт</h1>
      {owner&&<Link className="btn secondary" href="/users">Сотрудники и доступ</Link>}
      <AccountSettingsPanel />
    </div>
  );
}
