'use client';
import layout from '@/components/settings/SettingsLayout.module.css';
import { BotSettingsPanel } from '@/components/settings/BotSettingsPanel';
export default function Page(){return <div className={`${layout.page} ${layout.telegram}`}><h1 className="page-title">Telegram</h1><BotSettingsPanel/></div>}
