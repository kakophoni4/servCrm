'use client';
import layout from '@/components/settings/SettingsLayout.module.css';
import { MasterSalaryPanel } from '@/components/settings/MasterSalaryPanel';
export default function Page(){return <div className={`${layout.page} ${layout.salary}`}><h1 className="page-title">Проценты и доли</h1><MasterSalaryPanel /></div>}
