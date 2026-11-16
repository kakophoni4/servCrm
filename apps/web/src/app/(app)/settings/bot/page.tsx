'use client';
import { BotSettingsPanel } from '@/components/settings/BotSettingsPanel';
export default function Page(){return <div><h1 className="page-title">Telegram</h1><p>Подключите бота, затем в разделе «Мастера» выдайте каждому персональную ссылку. Мастер один раз нажимает «Старт». После назначения и сохранения заявки бот отправляет её автоматически.</p><BotSettingsPanel/></div>}
