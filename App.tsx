import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  MessageCircle, Users, Gift, UserRound, Crown, Store, Settings, Search,
  Plus, Bell, Menu, X, Send, Paperclip, Smile, ChevronRight, Sparkles,
  ShieldCheck, LogOut, Camera, Check, LockKeyhole, Star, Gem, Heart,
  CircleHelp, ArrowLeft, Image as ImageIcon
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Page = 'chats' | 'contacts' | 'gifts' | 'profile' | 'premium' | 'market' | 'settings'
type Profile = { id: string; aura_id: number; username: string | null; display_name: string; bio: string; avatar_url: string | null; cover_url: string | null; premium_until: string | null }
type GiftItem = { id: string; slug: string; title: string; emoji: string; rarity: string; description: string; limited: boolean }
type Chat = { id: string; title: string; last_message?: string; updated_at?: string }

const demoGifts: GiftItem[] = [
  { id:'moon', slug:'moonlight', title:'Moonlight', emoji:'🌙', rarity:'Обычный', description:'Тихое сияние ночи', limited:false },
  { id:'heart', slug:'crystal-heart', title:'Crystal Heart', emoji:'💎', rarity:'Редкий', description:'Кристалл особенной связи', limited:false },
  { id:'orbit', slug:'orbit', title:'Orbit', emoji:'🪐', rarity:'Эпический', description:'Маленькая личная галактика', limited:false },
  { id:'rose', slug:'velvet-rose', title:'Velvet Rose', emoji:'🌹', rarity:'Легендарный', description:'Цветок, который не увядает', limited:true },
  { id:'star', slug:'starlight', title:'Starlight', emoji:'⭐', rarity:'Редкий', description:'Пойманная звезда', limited:false },
  { id:'bear', slug:'soft-bear', title:'Soft Bear', emoji:'🧸', rarity:'Эпический', description:'Тёплый цифровой талисман', limited:true }
]

const nav: {id:Page; label:string; icon:any}[] = [
  {id:'chats',label:'Сообщения',icon:MessageCircle},
  {id:'contacts',label:'Контакты',icon:Users},
  {id:'gifts',label:'Подарки',icon:Gift},
  {id:'profile',label:'Мой профиль',icon:UserRound},
  {id:'premium',label:'AURA Premium',icon:Crown},
  {id:'market',label:'Маркетплейс',icon:Store},
  {id:'settings',label:'Настройки',icon:Settings}
]

function App() {
  const [session,setSession] = useState<Session|null>(null)
  const [profile,setProfile] = useState<Profile|null>(null)
  const [page,setPage] = useState<Page>('chats')
  const [loading,setLoading] = useState(true)
  const [authMode,setAuthMode] = useState<'login'|'signup'>('signup')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [authBusy,setAuthBusy] = useState(false)
  const [authMessage,setAuthMessage] = useState('')
  const [mobileMenu,setMobileMenu] = useState(false)
  const [search,setSearch] = useState('')
  const [giftItems,setGiftItems] = useState<GiftItem[]>(demoGifts)
  const [myGifts,setMyGifts] = useState<string[]>([])
  const [chats,setChats] = useState<Chat[]>([])
  const [activeChat,setActiveChat] = useState<string|null>(null)
  const [messages,setMessages] = useState<any[]>([])
  const [draft,setDraft] = useState('')
  const [toast,setToast] = useState('')
  const [editName,setEditName] = useState('')
  const [editUsername,setEditUsername] = useState('')
  const [editBio,setEditBio] = useState('')

  const notify = (message:string) => { setToast(message); window.setTimeout(()=>setToast(''),2600) }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setLoading(false) })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user || !supabase) { setProfile(null); return }
    void loadProfile(session.user.id)
  }, [session])

  async function loadProfile(userId:string) {
    if (!supabase) return
    const {data,error} = await supabase.from('profiles').select('*').eq('id',userId).maybeSingle()
    if (error) { notify(error.message); return }
    if (data) {
      setProfile(data as Profile); setEditName(data.display_name); setEditUsername(data.username ?? ''); setEditBio(data.bio ?? '')
    } else {
      const fallback = session?.user.email?.split('@')[0] || 'AURA user'
      const {data:created,error:createError} = await supabase.from('profiles').insert({id:userId,display_name:fallback}).select().single()
      if (!createError && created) { setProfile(created as Profile); setEditName(created.display_name) }
    }
    const {data:owned} = await supabase.from('user_gifts').select('gift_id').eq('user_id',userId)
    if (owned) setMyGifts(owned.map((g:any)=>g.gift_id))
    const {data:memberRows} = await supabase.from('conversation_members').select('conversation_id, conversations(id,title,updated_at)')
    if (memberRows) setChats(memberRows.map((r:any)=>({id:r.conversations.id,title:r.conversations.title || 'Личный чат',updated_at:r.conversations.updated_at})))
  }

  async function authenticate(e:React.FormEvent) {
    e.preventDefault(); if (!supabase) return
    setAuthBusy(true); setAuthMessage('')
    const result = authMode==='signup'
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password})
    setAuthBusy(false)
    if (result.error) setAuthMessage(result.error.message)
    else if (authMode==='signup' && !result.data.session) setAuthMessage('Проверь почту и подтверди регистрацию. Затем войди в AURA.')
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); setSession(null); setProfile(null) }

  async function saveProfile() {
    if (!supabase || !session?.user) { notify('Подключи Supabase, чтобы сохранять профиль'); return }
    const username = editUsername.trim().replace(/^@/,'').toLowerCase()
    if (username && !/^[a-z0-9_]{5,32}$/.test(username)) { notify('Username: 5–32 символа, латиница, цифры и _'); return }
    const {data,error} = await supabase.from('profiles').update({display_name:editName.trim()||'AURA user',username:username||null,bio:editBio.trim()}).eq('id',session.user.id).select().single()
    if (error) notify(error.message)
    else { setProfile(data as Profile); notify('Профиль сохранён') }
  }

  async function claimGift(gift:GiftItem) {
    if (!supabase || !session?.user) { notify('Для получения подарков войди в аккаунт'); return }
    const {error} = await supabase.rpc('claim_free_gift',{p_gift_slug:gift.slug})
    if (error) notify(error.message)
    else { setMyGifts(old=>[...old,gift.id]); notify(`Подарок ${gift.title} добавлен в коллекцию`) }
  }

  async function openConversation(id:string) {
    setActiveChat(id); if (!supabase) return
    const {data,error} = await supabase.from('messages').select('id,sender_id,body,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(100)
    if (error) notify(error.message); else setMessages(data||[])
    const channel = supabase.channel(`chat-${id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${id}`},payload=>setMessages(old=>[...old,payload.new])).subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }

  async function sendMessage(e:React.FormEvent) {
    e.preventDefault()
    if (!supabase || !session?.user || !activeChat || !draft.trim()) return
    const body = draft.trim(); setDraft('')
    const {error} = await supabase.from('messages').insert({conversation_id:activeChat,sender_id:session.user.id,body})
    if (error) { setDraft(body); notify(error.message) }
  }

  const title = nav.find(n=>n.id===page)?.label ?? 'AURA'
  const filteredGifts = useMemo(()=>giftItems.filter(g=>(g.title+' '+g.rarity).toLowerCase().includes(search.toLowerCase())),[giftItems,search])

  if (loading) return <div className="center-screen"><div className="brand-mark">A</div><p>Загружаем AURA…</p></div>
  if (isSupabaseConfigured && !session) return <div className="auth-screen"><div className="auth-card">
    <div className="brand-lockup"><div className="brand-mark">A</div><div><b>AURA</b><small>YOUR SPACE. YOUR RULES.</small></div></div>
    <div className="eyebrow">WELCOME TO AURA</div><h1>{authMode==='signup'?'Создай свой аккаунт':'С возвращением'}</h1><p>Твоё пространство для общения, самовыражения и коллекций.</p>
    <form onSubmit={authenticate}><label>Email</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><label>Пароль</label><input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Минимум 8 символов"/><button className="btn primary full" disabled={authBusy}>{authBusy?'Подождите…':authMode==='signup'?'Создать аккаунт':'Войти'}</button></form>
    {authMessage&&<div className="notice">{authMessage}</div>}<button className="text-button" onClick={()=>setAuthMode(authMode==='signup'?'login':'signup')}>{authMode==='signup'?'Уже есть аккаунт? Войти':'Нет аккаунта? Зарегистрироваться'}</button>
  </div></div>

  return <div className="shell">
    <aside className={`sidebar ${mobileMenu?'open':''}`}>
      <div className="brand-lockup"><div className="brand-mark">A</div><div><b>AURA</b><small>YOUR SPACE. YOUR RULES.</small></div><button className="mobile-close" onClick={()=>setMobileMenu(false)}><X/></button></div>
      <button className="my-account" onClick={()=>{setPage('profile');setMobileMenu(false)}}><div className="avatar">{profile?.avatar_url?<img src={profile.avatar_url}/>:<span>{(profile?.display_name||'A').slice(0,1).toUpperCase()}</span>}</div><div className="account-label"><b>{profile?.display_name||'Мой аккаунт'}</b><small>@{profile?.username||'username'}</small></div><ChevronRight size={16}/></button>
      <div className="nav-label">МЕНЮ</div><nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>{setPage(item.id);setMobileMenu(false);setActiveChat(null)}}><Icon size={19}/><span>{item.label}</span>{item.id==='premium'&&<span className="nav-new">NEW</span>}</button>})}</nav>
      <div className="sidebar-bottom"><div className="online-dot"/> AURA · ранний доступ <button onClick={signOut} title="Выйти"><LogOut size={16}/></button></div>
    </aside>

    <main className="workspace">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileMenu(true)}><Menu/></button><div><div className="eyebrow">AURA MESSENGER</div><h1>{title}</h1></div><div className="topbar-actions"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск в AURA"/></div><button className="icon-button" onClick={()=>notify('Новых уведомлений пока нет')}><Bell size={18}/></button></div></header>
      {!isSupabaseConfigured&&<div className="setup-banner"><ShieldCheck size={18}/><div><b>Режим предварительного просмотра</b><span>Добавь ключи Supabase в файл .env, чтобы включить аккаунты и облачное сохранение.</span></div></div>}
      {page==='chats'&&<section className="chat-layout">
        <div className="chat-list card"><div className="card-head"><div><h2>Сообщения</h2><p>Твои личные разговоры</p></div><button className="round-action" onClick={()=>notify('Создание чата подключим следующим этапом')}><Plus size={18}/></button></div>
          {chats.length===0?<div className="empty-state"><div className="empty-icon"><MessageCircle/></div><b>Пока нет переписок</b><p>Когда появятся друзья, здесь будут ваши чаты.</p><button className="btn secondary" onClick={()=>setPage('contacts')}>Найти людей</button></div>:chats.map(c=><button className={`chat-row ${activeChat===c.id?'selected':''}`} key={c.id} onClick={()=>void openConversation(c.id)}><div className="avatar chat-avatar">{c.title.slice(0,1)}</div><div className="chat-row-text"><b>{c.title}</b><small>Открой, чтобы посмотреть сообщения</small></div></button>)}
        </div>
        <div className="conversation card">{activeChat?<><div className="conversation-head"><div className="avatar">A</div><div><b>Чат AURA</b><small>соединение активно</small></div></div><div className="message-feed">{messages.map(m=><div key={m.id} className={`bubble ${m.sender_id===session?.user.id?'mine':''}`}>{m.body}<small>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small></div>)}</div><form className="composer" onSubmit={sendMessage}><button type="button" className="icon-button"><Paperclip size={18}/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Написать сообщение…"/><button type="button" className="icon-button"><Smile size={18}/></button><button className="send-button"><Send size={17}/></button></form></>:<div className="empty-state"><div className="empty-icon"><MessageCircle/></div><b>Выбери переписку</b><p>Твои сообщения будут отображаться здесь.</p></div>}</div>
      </section>}

      {page==='contacts'&&<section className="content-page"><div className="page-intro"><div className="eyebrow">COMMUNITY</div><h2>Люди AURA</h2><p>Находи друзей по имени или уникальному username.</p></div><div className="card search-card"><Search/><input placeholder="Поиск по @username или имени" value={search} onChange={e=>setSearch(e.target.value)}/><span className="muted">Поиск пользователей подключим к базе в следующем шаге.</span></div><div className="empty-state card"><div className="empty-icon"><Users/></div><b>Твоё сообщество начинается здесь</b><p>Когда поиск пользователей будет включён, ты сможешь находить людей и начинать новые чаты.</p></div></section>}

      {page==='gifts'&&<section className="content-page"><div className="page-intro"><div className="eyebrow">DIGITAL COLLECTIBLES</div><h2>Подарки AURA</h2><p>Собирай цифровые предметы, открывай редкие серии и украшай профиль.</p></div><div className="gift-tabs"><span className="active-tab">Все подарки</span><span>Обычные</span><span>Редкие</span><span>Легендарные</span></div><div className="gift-grid">{filteredGifts.map(g=><div className="gift-card card" key={g.id}><div className={`gift-art rarity-${g.rarity}`}>{g.emoji}</div><div className="gift-meta"><span>{g.rarity}</span>{g.limited&&<span className="limited">LIMITED</span>}</div><h3>{g.title}</h3><p>{g.description}</p><button className="btn secondary full" onClick={()=>void claimGift(g)}>{myGifts.includes(g.id)?<><Check size={15}/> В коллекции</>:'Получить бесплатно'}</button></div>)}</div></section>}

      {page==='profile'&&<section className="content-page"><div className="page-intro"><div className="eyebrow">YOUR IDENTITY</div><h2>Мой профиль</h2><p>Настрой свою страницу AURA — имя, username, описание и визуальный стиль.</p></div><div className="profile-editor card"><div className="profile-banner"><span>Обложка профиля</span><button className="cover-edit" onClick={()=>notify('Загрузка обложки — следующий этап')}><Camera size={15}/> Изменить</button></div><div className="profile-edit-body"><div className="profile-avatar-wrap"><div className="avatar profile-avatar">{profile?.avatar_url?<img src={profile.avatar_url}/>:<span>{(profile?.display_name||'A').slice(0,1).toUpperCase()}</span>}</div><button className="avatar-edit" onClick={()=>notify('Загрузка аватарки — следующий этап')}><Camera size={14}/></button></div><div className="profile-fields"><div className="field-row"><label>Отображаемое имя</label><input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Твоё имя"/></div><div className="field-row"><label>Username</label><div className="username-input"><span>@</span><input value={editUsername} onChange={e=>setEditUsername(e.target.value)} placeholder="username"/></div><small>5–32 символа: латиница, цифры и подчёркивание.</small></div><div className="field-row"><label>О себе</label><textarea value={editBio} onChange={e=>setEditBio(e.target.value)} maxLength={160} placeholder="Расскажи немного о себе…"/></div><div className="profile-id"><span>AURA ID</span><b>{profile?.aura_id?`#${profile.aura_id}`:'Будет назначен после настройки базы'}</b><LockKeyhole size={15}/></div><button className="btn primary" onClick={()=>void saveProfile()}>Сохранить изменения</button></div></div><div className="subsection"><h3>Моя коллекция</h3><div className="owned-gifts">{myGifts.length?myGifts.map(id=>{const g=giftItems.find(x=>x.id===id);return <div key={id} className="owned-item">{g?.emoji||'🎁'}<small>{g?.title||'Подарок'}</small></div>}):<div className="muted">Пока нет подарков. Загляни в раздел «Подарки».</div>}</div></div></div></section>}

      {page==='premium'&&<section className="content-page"><div className="premium-hero card"><div className="premium-orb"><Crown size={38}/></div><div className="eyebrow">AURA MEMBERSHIP</div><h2>Больше, чем мессенджер.</h2><p>Открой расширенное оформление, особые коллекции и дополнительные возможности AURA.</p><button className="btn premium-button" onClick={()=>notify('Оплата Premium появится после запуска платёжной системы')}>Скоро в AURA Premium <Sparkles size={16}/></button><small>Покупки пока отключены — это ранняя версия проекта.</small></div><div className="benefit-grid">{[{i:Gem,t:'Эксклюзивные подарки',d:'Особые цифровые коллекции для участников.'},{i:Sparkles,t:'Оформление профиля',d:'Дополнительные темы, эффекты и рамки.'},{i:Star,t:'Особый статус',d:'Значок AURA Premium рядом с именем.'},{i:Heart,t:'Поддержка проекта',d:'Помогай развивать независимый мессенджер.'}].map((b:any)=><div className="benefit card" key={b.t}><b.i size={22}/><h3>{b.t}</h3><p>{b.d}</p></div>)}</div></section>}

      {page==='market'&&<section className="content-page"><div className="page-intro"><div className="eyebrow">AURA EXCHANGE</div><h2>Маркетплейс</h2><p>Место для редких подарков и красивых username.</p></div><div className="market-grid"><div className="market-card card"><div className="market-icon">✦</div><h3>Коллекционные подарки</h3><p>В будущем здесь можно будет выставлять и обменивать цифровые предметы.</p><span className="coming">СКОРО</span></div><div className="market-card card"><div className="market-icon">@</div><h3>Красивые username</h3><p>Специальные имена пользователей с прозрачными правилами владения.</p><span className="coming">СКОРО</span></div></div></section>}

      {page==='settings'&&<section className="content-page"><div className="page-intro"><div className="eyebrow">PREFERENCES</div><h2>Настройки</h2><p>Управляй аккаунтом и безопасностью.</p></div><div className="settings-list card"><div className="setting-row"><div><b>Аккаунт</b><small>{session?.user.email||'Демо-режим'}</small></div><ChevronRight/></div><div className="setting-row"><div><b>Приватность</b><small>Видимость номера и профиля — будет добавлена</small></div><ChevronRight/></div><div className="setting-row"><div><b>Безопасность</b><small>Управление сессиями и паролем</small></div><ChevronRight/></div><div className="setting-row"><div><b>О AURA</b><small>Версия 0.1.0 · ранний доступ</small></div><span className="version">0.1.0</span></div></div></section>}
      <footer className="footer">AURA <span>·</span> Твоё пространство. Твои правила.</footer>
    </main>
    {toast&&<div className="toast"><Check size={16}/>{toast}</div>}
  </div>
}
export default App
