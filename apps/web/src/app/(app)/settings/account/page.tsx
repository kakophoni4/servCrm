'use client';

import layout from '@/components/settings/SettingsLayout.module.css';
import Link from 'next/link';
import {getStoredUser} from '@/lib/api';
import {useEffect,useState} from 'react';
import { AccountSettingsPanel } from '@/components/settings/AccountSettingsPanel';

export default function AccountSettingsPage() {
  const [profile,setProfile]=useState<ReturnType<typeof getStoredUser>>(null);
  const [owner,setOwner]=useState(false);useEffect(()=>{const user=getStoredUser();setOwner(user?.role==='OWNER');setProfile(user)},[]);
  return (
    <div className={`settings-page account-page ${layout.page} ${layout.account}`}>
      <h1 className="page-title settings-page-title">Аккаунт</h1>
      {profile&&<div className={`panel ${layout.profile}`}><div><strong>{profile.fullName||profile.login}</strong><div className="muted">{profile.login}</div></div>{owner&&<Link className="btn secondary" href="/users">Сотрудники и доступ</Link>}</div>}
      <AccountSettingsPanel />
    </div>
  );
}
