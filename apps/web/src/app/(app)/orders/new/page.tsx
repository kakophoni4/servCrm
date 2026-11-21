'use client';
import '@/components/desk/ReadableWorkflows.css';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileFold } from '@/components/MobileFold';
import { TechPicker } from '@/components/TechPicker';
import { AutoTextarea } from '@/components/AutoTextarea';
import { type BranchCity } from '@/components/BranchSelect';
import { orderDateIso } from '@/lib/order-date';
import { DateTimeField } from '@/components/DateTimeField';
import { api, getStoredUser } from '@/lib/api';
import { digitsPhone, formatRuPhoneInput } from '@/lib/phone';

type Dict = { id: string; name?: string; label?: string };
type ClientHit = {
  id: string;
  name: string;
  phoneNormalized: string;
  _count?: { orders: number };
};

export default function NewOrderPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Dict[]>([]);
  const [, setAges] = useState<Dict[]>([]);
  const [, setCities] = useState<BranchCity[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientHint, setClientHint] = useState('');
  const phoneLookupSeq = useRef(0);

  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '+7 ',
    avitoItemId:'',
    type: 'NEW',
    isPersonal: false,
    isServiceCenter: false,
    sourceKind: 'OUR',
    sourceOur: 'AVITO',
    partnerId: '',
    address: '',
    ageCategoryId: '',
    comment: '',
    isProfile: true,
    typeTech: '',
    cityId: '',
    scheduledAt: '',
  });

  useEffect(() => {
    Promise.all([
      api<Dict[]>('/partners'),
      api<Dict[]>('/cities/age-categories'),
      api<BranchCity[]>('/cities'),
    ])
      .then(([p, a, c]) => {
        setPartners(p);
        setAges(a);
        setCities(c);

        if (c[0]) setForm((f) => ({ ...f, cityId: getStoredUser()?.cityId || c[0].id }));
        if (p[0]) setForm((f) => ({ ...f, partnerId: p[0].id }));
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ошибка справочников'),
      );
  }, []);

  useEffect(()=>{
    const chatId=new URLSearchParams(window.location.search).get('avitoChat');
    if(!chatId||getStoredUser()?.role!=='OWNER')return;
    const abort=new AbortController();
    api<{clientName:string;comment:string;itemId?:string|number|null}>('/avito/draft/'+encodeURIComponent(chatId),{signal:abort.signal})
      .then(draft=>{if(!abort.signal.aborted)setForm(f=>({...f,clientName:f.clientName||draft.clientName||'',comment:f.comment||draft.comment||'',avitoItemId:String(draft.itemId||''),sourceKind:'OUR',sourceOur:'AVITO'}))})
      .catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить данные Авито')});
    return()=>abort.abort();
  },[]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function lookupClientByPhone(phoneRaw: string) {
    const digits = digitsPhone(phoneRaw);
    if (digits.length < 11) {
      setClientHint('');
      return;
    }
    const seq = ++phoneLookupSeq.current;
    try {
      const hits = await api<ClientHit[]>(
        `/clients?phone=${encodeURIComponent(digits)}`,
      );
      if (seq !== phoneLookupSeq.current) return;
      const exact =
        hits.find((c) => c.phoneNormalized === digits) ?? hits[0] ?? null;
      if (!exact) {
        setClientHint('Новый клиент');
        return;
      }
      setForm((f) => ({
        ...f,
        clientName: exact.name,
        type: f.type === 'WARRANTY' ? 'WARRANTY' : 'REPEAT',
      }));
      const n = exact._count?.orders ?? 0;
      setClientHint(
        n > 0 ? `Клиент уже есть · ${n} заявок` : 'Клиент уже есть',
      );
    } catch {
      if (seq === phoneLookupSeq.current) setClientHint('');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const phoneDigits = digitsPhone(form.clientPhone);
    if (phoneDigits.length < 11 && !new URLSearchParams(window.location.search).get('avitoChat')) {
      setError('Укажите полный номер телефона');
      setLoading(false);
      return;
    }
    if (!form.scheduledAt) {
      setError('Укажите дату и время');
      setLoading(false);
      return;
    }
    let scheduledIso='';
    try { scheduledIso=orderDateIso(form.scheduledAt); } catch { setError('Некорректная дата или время');setLoading(false);return; }
    const scheduledDate = new Date(scheduledIso);
    if (Number.isNaN(scheduledDate.getTime())) {
      setError('Некорректная дата или время');
      setLoading(false);
      return;
    }

    try {
      const body = {
        clientName: form.clientName,
        clientPhone: phoneDigits.length>=11?phoneDigits:'',
        avitoChatId:new URLSearchParams(window.location.search).get('avitoChat')||undefined,
        avitoItemId:form.avitoItemId||undefined,
        type: form.type,
        isPersonal: form.isPersonal,
        isServiceCenter: form.isServiceCenter,
        sourceKind: form.sourceKind,
        sourceOur: form.sourceKind === 'OUR' ? form.sourceOur : undefined,
        partnerId: form.sourceKind === 'PARTNER' ? form.partnerId : undefined,
        scheduledAt: scheduledIso,
        address: form.address,
        ageCategoryId: form.ageCategoryId || undefined,
        comment: form.comment || undefined,
        isProfile: form.isProfile,
        typeTech: form.typeTech || undefined,
        cityId: form.cityId || undefined,
      };
      const order = await api<{ id: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      router.replace(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="order-new-page">
      <h1 className="page-title">Новая заявка</h1>
      <form id="new-order-form" className="panel order-new-form order-new-compact" onSubmit={onSubmit}>
        <section className="order-new-section">
          <h2 className="order-new-section-title">Клиент</h2>
          <div className="order-new-grid">
            <div className="field">
              <label htmlFor="new-client-phone">Телефон</label>
              <input
                required
                id="new-client-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.clientPhone}
                onChange={(e) => {
                  const next = formatRuPhoneInput(e.target.value);
                  set('clientPhone', next);
                  if (digitsPhone(next).length < 11) setClientHint('');
                }}
                onBlur={() => void lookupClientByPhone(form.clientPhone)}
                placeholder="+7 (999) 123-45-67"
              />
              {clientHint ? (
                <p className="muted order-new-phone-hint">{clientHint}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="new-client-name">Имя клиента</label>
              <input
                required
                id="new-client-name"
                autoComplete="name"
                value={form.clientName}
                onChange={(e) => set('clientName', e.target.value)}
                placeholder="Как обращаться"
              />
            </div>
          </div>
        </section>

        <section className="order-new-section">
          <h2 className="order-new-section-title">Заявка</h2>
          <label className="order-new-center"><input type="checkbox" checked={form.isServiceCenter} onChange={e=>setForm(f=>({...f,isServiceCenter:e.target.checked,...(e.target.checked?{isPersonal:false}:{})}))}/> Привезут в СЦ</label>
          <div className="order-new-grid order-new-grid-details">
            {!form.isServiceCenter && <div className="field order-new-field-wide">
              <label htmlFor="new-address">Адрес</label>
              <input
                required
                id="new-address"
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Улица, дом, квартира"
              />
            </div>}
            <div className="field">
              <label>Тип техники</label>
              <TechPicker value={form.typeTech} onChange={v=>set('typeTech',v)}/>
            </div>
            <div className="field">
              <label>Дата и время</label>
              <DateTimeField
                required
                showQuickPicks
                value={form.scheduledAt}
                onChange={(scheduledAt) => set('scheduledAt', scheduledAt)}
              />
            </div>
            <div className="field order-new-field-wide">
              <label>Неисправность</label>
              <AutoTextarea
                value={form.comment}
                onChange={(e) => set('comment', e.target.value)}
              />
            </div>
          </div>
        </section>

        <MobileFold title="Условия заявки" className="order-new-section order-new-extra">
          <h2 className="order-new-section-title">Условия заявки</h2>
          <label className="service-center-check"><input type="checkbox" checked={form.isPersonal} onChange={e=>setForm(f=>({...f,isPersonal:e.target.checked,...(e.target.checked?{isServiceCenter:false}:{})}))}/> Выполняю сам</label>
          <div className="order-new-grid">
            <div className="field">
              <label>Тип</label>
              <select
                value={form.type === 'REPEAT' ? 'NEW' : form.type}
                onChange={(e) => set('type', e.target.value)}
              >
                <option value="NEW">Обычная</option>
                <option value="WARRANTY">Гарантия</option>
              </select>
            </div>
            <div className="field">
              <label>Источник</label>
              <select
                value={form.sourceKind}
                onChange={(e) => set('sourceKind', e.target.value)}
              >
                <option value="OUR">Наша заявка</option>
                <option value="PARTNER">Партнёрская</option>
              </select>
            </div>
            {form.sourceKind === 'OUR' ? (
              <div className="field">
                <label>Канал</label>
                <select
                  value={form.sourceOur}
                  onChange={(e) => set('sourceOur', e.target.value)}
                >
                  <option value="AVITO">Авито</option>
                  <option value="LEAFLET">Лист</option><option value="SITE">Сайт</option>
                </select>
              </div>
            ) : (
              <div className="field">
                <label>Партнёр</label>{getStoredUser()?.role==='OWNER'&&<button type="button" className="btn secondary" onClick={async()=>{const name=window.prompt('Имя партнёра');if(!name?.trim())return;try{const p=await api<{id:string;name:string}>('/partners',{method:'POST',body:JSON.stringify({name:name.trim()})});setPartners(v=>[...v.filter(x=>x.id!==p.id),p]);set('partnerId',p.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось добавить')}}}>Добавить партнёра</button>}
                <select
                  required
                  value={form.partnerId}
                  onChange={(e) => set('partnerId', e.target.value)}
                >
                  <option value="">- выберите партнёра -</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </MobileFold>

        <div className="order-new-footer">
          {error ? <p className="error order-new-error">{error}</p> : null}
          <button
            className="btn order-new-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Сохраняем…' : 'Создать заявку'}
          </button>
        </div>
      </form>
    </div>
  );
}
