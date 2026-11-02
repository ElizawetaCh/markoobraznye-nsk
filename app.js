(() => {
'use strict';
const OWNER='kiberdoker-pixel';
const REPO='markoobraznye-nsk';
const API='https://api.github.com/repos/'+OWNER+'/'+REPO+'/issues?state=open&per_page=50&sort=created&direction=desc';
const $=q=>document.querySelector(q);
const $$=q=>Array.from(document.querySelectorAll(q));
const onboard=$('#onboard'),screen=$('#screen'),remember=$('#remember');
const saved=(()=>{try{return JSON.parse(localStorage.getItem('mnsk_pwa_preferences'))||{}}catch{return {}}})();
const labels={home:['КЛУБНОЕ ПРИЛОЖЕНИЕ','Главная'],calendar:['ПЛАНЫ И ВСТРЕЧИ','Календарь мероприятий'],news:['ЖИЗНЬ КЛУБА','Новости'],admins:['ЛЮДИ И МАШИНЫ','Администраторы'],photos:['ЖИЗНЬ КЛУБА В КАДРАХ','Фотоотчеты'],partners:['НАШИ ДРУЗЬЯ','Партнёры'],merch:['КЛУБНАЯ АТРИБУТИКА','Мерч'],admin:['УПРАВЛЕНИЕ','Админ-панель']};
let current='home',mode='member',cachedNews=[],loading=false,lastFetched=0;
const content=()=>window.ContentStore.get();
function applyMode(){
  document.body.dataset.mode=mode;
  const btn=$('#adminOpen');
  if(btn)btn.hidden=mode!=='admin';
}
function login(member) {
  mode=member?'member':'admin';
  if(remember.checked) {try{localStorage.setItem('mnsk_pwa_preferences',JSON.stringify({mode}))}catch{}}
  onboard.classList.add('hidden');screen.classList.remove('hidden');
  applyMode();
  goto(member?'home':'admin'); loadNews();
}
$('#memberStart').addEventListener('click',()=>login(true));
$('#adminStart').addEventListener('click',()=>login(false));
$('#settings').addEventListener('click',()=>{
  localStorage.removeItem('mnsk_pwa_preferences');screen.classList.add('hidden');onboard.classList.remove('hidden');window.scrollTo(0,0);
});
$('#adminOpen').addEventListener('click',()=>goto('admin'));
$$('[data-to]').forEach(btn=>btn.addEventListener('click',()=>goto(btn.getAttribute('data-to'))));
function goto(id){
  if(!labels[id]||(id==='admin'&&mode!=='admin'))id='home';
  current=id;
  const mast=$('.masthead');if(mast)mast.classList.toggle('is-compact',id!=='home');
  $$('[data-page]').forEach(el=>el.classList.toggle('hidden',el.dataset.page!==id));
  $$('.bottom [data-to]').forEach(el=>el.classList.toggle('current',el.dataset.to===id));
  $('#pageKicker').textContent=labels[id][0];$('#pageTitle').textContent=labels[id][1];
  window.scrollTo({top:0,behavior:'instant'});
  if(id==='news'||id==='home')loadNews();
}
function safeUrl(str){
 try{const u=new URL(str);return u.protocol==='https:'?u.href:null}catch{return null}
}
function pictureFromText(body){
  const match=body.match(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/i) || body.match(/(https:\/\/(?:github\.com\/user-attachments\/assets\/|user-images\.githubusercontent\.com\/)[^\s<)]+)/i);
  return match?safeUrl(match[1]):null;
}
function extractText(body){
  const block=body.match(/###\s*Текст новости\s*\n+([\s\S]*?)(?=\n###\s|$)/i);
  let x=block?block[1]:body;
  return x.replace(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/g,'').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/<!--[\s\S]*?-->/g,'').replace(/^###.+$/gm,'').trim().slice(0,5000);
}
function sampleNews(){
  return [{id:'demo',date:'2026-10-23',title:'Добро пожаловать в тестовую версию',text:'Это пример публикации. Когда владелец клуба создаст в GitHub первую новость, она автоматически появится здесь на всех телефонах. Для обновления не потребуется новая установка.',picture:null,isDemo:true,url:null}];
}
async function loadNews(force=false){
 if(loading)return;
 if(!force && Date.now()-lastFetched<45000){renderNews();return}
 loading=true;
 $('#news-status').textContent='Получаем свежие новости…';
 try{
   const resp=await fetch(API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
   if(!resp.ok)throw new Error('GitHub API: '+resp.status);
   const arr=await resp.json();
   cachedNews=arr.filter(issue=>{
      if(issue.pull_request||!issue.title.toUpperCase().startsWith('[НОВОСТЬ]'))return false;
      return issue.user?.login?.toLowerCase()===OWNER || (issue.labels||[]).some(x=>x.name?.toLowerCase()==='published');
   }).map(issue=>({
      id:issue.id,title:issue.title.replace(/^\[НОВОСТЬ\]\s*/i,'').trim(),
      date:issue.created_at.slice(0,10),text:extractText(issue.body||''),
      picture:pictureFromText(issue.body||''),url:issue.html_url,isDemo:false
   }));
   lastFetched=Date.now();
   $('#news-status').textContent='Публикации обновлены · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 }catch(e){
   $('#news-status').textContent='Не удалось проверить новости в GitHub. Проверьте интернет и публичность репозитория.';
   console.warn('News fetch:',e);
 }finally{loading=false;renderNews()}
}
function makeCard(item){
 const card=document.createElement('article');card.className='news-card';
 const meta=document.createElement('div');meta.className='date';
 meta.textContent=new Date(item.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})+(item.isDemo?' · ДЕМО':'');
 card.append(meta);
 const title=document.createElement('h3');title.textContent=item.title;card.append(title);
 if(item.picture){const img=document.createElement('img');img.src=item.picture;img.loading='lazy';img.alt='Фотография публикации';img.referrerPolicy='no-referrer';card.append(img)}
 const teaserText=item.text||'';
 const teaser=document.createElement('p');teaser.textContent=teaserText.length>200?teaserText.slice(0,200)+'…':teaserText;card.append(teaser);
 if(!item.isDemo){
   const btn=document.createElement('button');btn.className='link';btn.textContent='Подробнее →';
   btn.addEventListener('click',()=>openStory(item));card.append(btn);
 }
 return card;
}
function localNews(){
 return (content().news||[]).map(item=>({...item,local:true,isDemo:false,url:null}));
}
function allNews(){
 return [...localNews(),...cachedNews].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}
function renderNews(){
 const items=allNews();
 const list=items.length?items:sampleNews();
 for(const [target,shown] of [['#news-list',list],['#home-news',list.slice(0,2)]]){
  const area=$(target);area.replaceChildren();shown.forEach(x=>area.append(makeCard(x)));
 }
}
/* Calendar, administrators and partners are public views of the same content store. */
const MONTHS_SHORT=['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];
function eventParts(value){
 const date=new Date(String(value||'')+'T12:00:00');
 if(Number.isNaN(date.getTime()))return {day:'—',month:'—'};
 return {day:String(date.getDate()).padStart(2,'0'),month:MONTHS_SHORT[date.getMonth()]};
}
function emptyHint(text){
 const hint=document.createElement('p');hint.className='hint';hint.textContent=text;return hint;
}
function renderEvents(){
 const list=$('#eventList');if(!list)return;
 const events=(content().events||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
 if(!events.length){list.replaceChildren(emptyHint('Пока нет запланированных встреч. Администраторы добавят их в админ-панели.'));return}
 list.replaceChildren(...events.map(event=>{
  const card=document.createElement('article');card.className='event-card';
  const parts=eventParts(event.date);
  const dayBox=document.createElement('div');dayBox.className='day';dayBox.append(document.createTextNode(parts.day));
  const small=document.createElement('small');small.textContent=parts.month;dayBox.append(small);
  const body=document.createElement('div');body.className='event-body';
  if(event.badge){const badge=document.createElement('span');badge.className='badge';badge.textContent=event.badge;body.append(badge)}
  const title=document.createElement('h3');title.textContent=event.title||'Мероприятие';body.append(title);
  const text=document.createElement('p');text.textContent=event.text||'';body.append(text);
  card.append(dayBox,body);return card;
 }));
}
function renderAdmins(){
 const list=$('#adminList');if(!list)return;
 const admins=content().admins||[];
 if(!admins.length){list.replaceChildren(emptyHint('Состав администраторов пока не заполнен.'));return}
 list.replaceChildren(...admins.map(admin=>{
  const card=document.createElement('article');card.className='admin-card admin-profile';
  const media=document.createElement('div');media.className='admin-profile__media';
  if(admin.photo){
   const img=document.createElement('img');img.className='admin-profile__photo';img.src=admin.photo;
   img.alt=admin.car?'Автомобиль: '+admin.car:'Фото администратора';img.loading='lazy';img.decoding='async';
   media.append(img);
  }else{
   const placeholder=document.createElement('div');placeholder.className='admin-profile__placeholder';
   placeholder.innerHTML='<div class="admin-profile__placeholder-icon" aria-hidden="true">♙</div><span>Фото скоро</span>';
   media.append(placeholder);
  }
  const details=document.createElement('div');details.className='admin-profile__details';
  const name=document.createElement('h3');name.textContent=admin.name||'Администратор';
  const role=document.createElement('p');role.textContent=admin.role||'Администратор';
  details.append(name,role);
  card.append(media,details);return card;
 }));
}
function renderPartners(){
 const list=$('#partnersList'),empty=$('#partnersEmpty');if(!list||!empty)return;
 const partners=content().partners||[];
 if(!partners.length){list.hidden=true;list.replaceChildren();empty.hidden=false;return}
 empty.hidden=true;list.hidden=false;
 list.replaceChildren(...partners.map(partner=>{
  const card=document.createElement('article');card.className='partner-card';
  const media=document.createElement('div');media.className='partner-card__media';
  if(partner.logo){
   const img=document.createElement('img');img.src=partner.logo;img.alt=partner.name||'Партнёр';img.loading='lazy';img.decoding='async';media.append(img);
  }else{
   const mark=document.createElement('span');mark.className='partner-card__mark';mark.setAttribute('aria-hidden','true');
   mark.textContent=(partner.name||'?').trim().charAt(0).toUpperCase();media.append(mark);
  }
  const body=document.createElement('div');body.className='partner-card__body';
  const name=document.createElement('h3');name.textContent=partner.name||'Партнёр';body.append(name);
  if(partner.description){const text=document.createElement('p');text.textContent=partner.description;body.append(text)}
  if(partner.url){
   const link=document.createElement('a');link.className='minilink';link.href=partner.url;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='Перейти на сайт ↗';body.append(link);
  }
  card.append(media,body);return card;
 }));
}
function openStory(item){
 const content=$('#dialogContent');content.replaceChildren();
 const h=document.createElement('h2');h.textContent=item.title;content.append(h);
 if(item.picture){const img=document.createElement('img');img.src=item.picture;img.alt='Фото';content.append(img)}
 const p=document.createElement('p');p.textContent=item.text||'';content.append(p);
 if(item.url){
   const src=document.createElement('a');src.href=item.url;src.target='_blank';src.rel='noopener';src.className='minilink';src.textContent='Открыть публикацию в GitHub ↗';content.append(src);
 }else{
   const note=document.createElement('div');note.className='mini-note';note.textContent='Опубликовано в приложении клуба.';content.append(note);
 }
 $('#storyDialog').showModal();
}
$('#refreshNews').addEventListener('click',()=>loadNews(true));
$('#closeDialog').addEventListener('click',()=>$('#storyDialog').close());
document.addEventListener('visibilitychange',()=>{if(!document.hidden && !screen.classList.contains('hidden'))loadNews()});
if(saved.mode==='member'||saved.mode==='admin'){
 mode=saved.mode;applyMode();
 onboard.classList.add('hidden');screen.classList.remove('hidden');goto(mode==='member'?'home':'admin');loadNews();
}
applyMode();
renderNews();
/* Merch: the home rail and the merch page are drawn from the same merch-data.js. */
const MERCH_ICONS={
  shirt:'<path d="M8 3.5 3.5 6.6l2.2 3.2L8 8.7V20.5h8V8.7l2.3 1.1 2.2-3.2L16 3.5l-2 1.6h-4L8 3.5Z"/>',
  hoodie:'<path d="M8 3.8 3.5 6.9l2.2 3.2L8 9V20.5h8V9l2.3 1.1 2.2-3.2L16 3.8"/><path d="M8 3.8c.4 2.6 2 4.3 4 4.3s3.6-1.7 4-4.3"/><path d="M9.8 14.6h4.4l-.5 3.6h-3.4z"/>',
  cap:'<path d="M3.6 16.6c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4"/><path d="M3.6 16.6h16.8"/><path d="M12 8.2v8.4"/><path d="M20.4 16.6c1.1 0 1.9.5 1.9 1.2 0 .7-1 1.2-2.4 1.2"/>',
  sticker:'<path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.8l5.9-.9L12 3.6Z"/>',
  frame:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 16.5l4.6-4.4 3.7 3.5 3-2.9 5.7 5.3"/>',
  key:'<circle cx="9" cy="9" r="4.2"/><path d="M12.2 12.2 20 20"/><path d="M16.8 16.8l2-2"/><path d="M14.9 14.9l2-2"/>'
};
function merchPicture(product,className){
  const box=document.createElement('div');
  box.className=className;
  box.setAttribute('aria-hidden','true');
  box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+(MERCH_ICONS[product.icon]||MERCH_ICONS.shirt)+'</svg>';
  return box;
}
/* Products can have real photos; the first one becomes the card cover. */
function merchPhotos(product){
  return Array.isArray(product.photos)?product.photos.filter(Boolean):[];
}
function merchVisual(product,className){
  const photos=merchPhotos(product);
  if(!photos.length)return merchPicture(product,className);
  const box=document.createElement('div');
  box.className=className+' merch-pic--photo';
  box.setAttribute('aria-hidden','true');
  const img=document.createElement('img');
  img.src=photos[0];img.alt='';img.loading='lazy';img.decoding='async';
  box.append(img);
  return box;
}
function renderMerch(){
  const products=Array.isArray(content().merch)?content().merch:[];
  const rail=$('#merchRail');
  if(rail){
    rail.replaceChildren(...products.map(p=>{
      const li=document.createElement('li');li.className='merch-item';
      const name=document.createElement('strong');name.textContent=p.name;
      const price=document.createElement('span');price.className='merch-item__price';price.textContent=p.price;
      li.append(merchVisual(p,'merch-item__pic'),name,price);
      return li;
    }));
  }
  const grid=$('#merchGrid');
  if(grid){
    grid.replaceChildren(...products.map(p=>{
      const card=document.createElement('button');
      card.type='button';card.className='merch-card';
      card.setAttribute('aria-label',p.name+' — '+p.price+'. Открыть карточку товара');
      const title=document.createElement('span');title.className='merch-card__name';title.textContent=p.name;
      const note=document.createElement('span');note.className='merch-card__note';note.textContent=p.note||'';
      const price=document.createElement('span');price.className='merch-card__price';price.textContent=p.price;
      card.append(merchVisual(p,'merch-card__pic'),title,note,price);
      card.addEventListener('click',()=>openMerch(p));
      return card;
    }));
  }
}
renderMerch();
/* Product dialog: photo gallery, description, size picker and measurement chart. */
function openMerch(product){
  const dialog=$('#merchDialog');
  const stale=dialog.querySelector('.merch-lightbox');
  if(stale)stale.remove();
  const box=$('#merchDialogContent');box.replaceChildren();
  const wrap=document.createElement('div');wrap.className='merch-modal';
  const photos=merchPhotos(product);
  let activePhoto=0;
  if(photos.length){
    const gallery=document.createElement('div');gallery.className='merch-gallery';
    const main=document.createElement('button');main.type='button';main.className='merch-gallery__main';
    main.setAttribute('aria-label','Открыть фото крупнее');
    const mainImg=document.createElement('img');mainImg.src=photos[activePhoto];mainImg.alt=product.name;mainImg.decoding='async';
    main.append(mainImg);
    main.addEventListener('click',()=>openPhotoViewer(photos,activePhoto));
    gallery.append(main);
    if(photos.length>1){
      const thumbs=document.createElement('div');thumbs.className='merch-gallery__thumbs';
      photos.forEach((src,index)=>{
        const thumb=document.createElement('button');thumb.type='button';thumb.className='merch-gallery__thumb';
        thumb.setAttribute('aria-label','Фото '+(index+1));
        if(index===0)thumb.setAttribute('aria-current','true');
        const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';img.decoding='async';
        thumb.append(img);
        thumb.addEventListener('click',()=>{
          activePhoto=index;mainImg.src=src;
          thumbs.querySelectorAll('.merch-gallery__thumb').forEach(other=>other.removeAttribute('aria-current'));
          thumb.setAttribute('aria-current','true');
        });
        thumbs.append(thumb);
      });
      gallery.append(thumbs);
    }
    const hint=document.createElement('p');hint.className='merch-gallery__hint';
    hint.textContent=photos.length>1?'Нажмите на фото, чтобы рассмотреть ближе. Листайте миниатюры.':'Нажмите на фото, чтобы рассмотреть ближе.';
    gallery.append(hint);
    wrap.append(gallery);
  }
  const head=document.createElement('div');head.className='merch-modal__head';
  const meta=document.createElement('div');meta.className='merch-modal__meta';
  const eyebrow=document.createElement('div');eyebrow.className='eyebrow';eyebrow.textContent='КЛУБНАЯ АТРИБУТИКА';
  const title=document.createElement('h2');title.id='merchDialogTitle';title.textContent=product.name;
  const price=document.createElement('div');price.className='merch-modal__price';price.textContent=product.price;
  meta.append(eyebrow,title,price);
  if(!photos.length)head.append(merchPicture(product,'merch-modal__pic'));
  head.append(meta);
  wrap.append(head);
  if(product.description){
    const desc=document.createElement('p');desc.className='merch-modal__desc';desc.textContent=product.description;wrap.append(desc);
  }
  if(Array.isArray(product.sizes)&&product.sizes.length){
    const row=document.createElement('div');row.className='merch-modal__sizes';
    const label=document.createElement('span');label.textContent='Размер';
    const chips=document.createElement('div');chips.className='size-chips';
    product.sizes.forEach((size,index)=>{
      const chip=document.createElement('button');
      chip.type='button';chip.className='size-chip';chip.textContent=size;
      chip.setAttribute('aria-pressed',index===0?'true':'false');
      chip.addEventListener('click',()=>{
        chips.querySelectorAll('.size-chip').forEach(other=>other.setAttribute('aria-pressed','false'));
        chip.setAttribute('aria-pressed','true');
      });
      chips.append(chip);
    });
    row.append(label,chips);wrap.append(row);
  }else if(product.sizesNote){
    const note=document.createElement('p');note.className='merch-modal__note';note.textContent=product.sizesNote;wrap.append(note);
  }
  if(product.chart){
    const chart=document.createElement('div');chart.className='size-chart';
    const chartTitle=document.createElement('h3');chartTitle.textContent='Размерная сетка';chart.append(chartTitle);
    const scroller=document.createElement('div');scroller.className='size-chart__scroll';
    const table=document.createElement('table');
    const thead=document.createElement('thead');const headRow=document.createElement('tr');
    ['Размер',...product.chart.columns].forEach(column=>{
      const th=document.createElement('th');th.scope='col';th.textContent=column;headRow.append(th);
    });
    thead.append(headRow);
    const tbody=document.createElement('tbody');
    product.chart.rows.forEach(values=>{
      const tr=document.createElement('tr');
      values.forEach((value,index)=>{
        const cell=document.createElement(index===0?'th':'td');
        if(index===0)cell.scope='row';
        cell.textContent=value;tr.append(cell);
      });
      tbody.append(tr);
    });
    table.append(thead,tbody);scroller.append(table);
    const unit=document.createElement('p');unit.className='size-chart__unit';unit.textContent='Мерки в сантиметрах, допуск ±1 см.';
    chart.append(scroller,unit);wrap.append(chart);
  }
  const actions=document.createElement('div');actions.className='merch-modal__actions';
  const order=document.createElement('a');order.className='btn primary';
  order.href='https://t.me/+G8howK-ojhw1MDAy';order.target='_blank';order.rel='noopener noreferrer';
  order.textContent='Уточнить в Telegram ↗';
  const close=document.createElement('button');close.type='button';close.className='btn outlined';close.textContent='Закрыть';
  close.addEventListener('click',()=>$('#merchDialog').close());
  actions.append(order,close);wrap.append(actions);
  box.append(wrap);
  $('#merchDialog').showModal();
}
$('#closeMerch').addEventListener('click',()=>$('#merchDialog').close());
$('#merchDialog').addEventListener('click',event=>{if(event.target===$('#merchDialog'))$('#merchDialog').close()});
/* Enlarged photo viewer inside the product dialog: arrows, counter, Escape. */
let closeLightbox=null;
function openPhotoViewer(photos,start){
  const host=$('#merchDialog');
  const existing=host.querySelector('.merch-lightbox');
  if(existing)existing.remove();
  let index=Math.max(0,Math.min(start||0,photos.length-1));
  const viewer=document.createElement('div');viewer.className='merch-lightbox';
  viewer.setAttribute('role','dialog');viewer.setAttribute('aria-label','Просмотр фото товара');
  const img=document.createElement('img');img.className='merch-lightbox__img';img.decoding='async';
  const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.className='merch-lightbox__close';closeBtn.setAttribute('aria-label','Закрыть фото');closeBtn.textContent='✕';
  const prev=document.createElement('button');prev.type='button';prev.className='merch-lightbox__nav merch-lightbox__nav--prev';prev.setAttribute('aria-label','Предыдущее фото');prev.textContent='‹';
  const next=document.createElement('button');next.type='button';next.className='merch-lightbox__nav merch-lightbox__nav--next';next.setAttribute('aria-label','Следующее фото');next.textContent='›';
  const count=document.createElement('div');count.className='merch-lightbox__count';
  viewer.append(img,closeBtn,prev,next,count);
  const show=i=>{
    index=(i+photos.length)%photos.length;
    img.src=photos[index];img.alt='Фото товара '+(index+1);
    count.textContent=(index+1)+' из '+photos.length;
    viewer.classList.toggle('is-single',photos.length<2);
  };
  const close=()=>{
    document.removeEventListener('keydown',onKey);
    viewer.remove();
    closeLightbox=null;
  };
  const onKey=event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='ArrowLeft'){show(index-1);}
    else if(event.key==='ArrowRight'){show(index+1);}
  };
  closeBtn.addEventListener('click',close);
  prev.addEventListener('click',()=>show(index-1));
  next.addEventListener('click',()=>show(index+1));
  viewer.addEventListener('click',event=>{if(event.target===viewer)close();});
  document.addEventListener('keydown',onKey);
  closeLightbox=close;
  show(index);
  host.append(viewer);
  closeBtn.focus();
}
$('#merchDialog').addEventListener('cancel',event=>{
  if(closeLightbox){event.preventDefault();closeLightbox();}
});
$('#merchDialog').addEventListener('close',()=>{if(closeLightbox)closeLightbox();});
/* Advertising rates: opened from the cooperation block on the home page. */
$('#adRatesOpen').addEventListener('click',()=>$('#adRatesDialog').showModal());
$('#adRatesClose').addEventListener('click',()=>$('#adRatesDialog').close());
$('#adRatesCancel').addEventListener('click',()=>$('#adRatesDialog').close());
$('#adRatesDialog').addEventListener('click',event=>{if(event.target===$('#adRatesDialog'))$('#adRatesDialog').close()});
/* Photo albums: the card and the dialog use the same cover from photos-data.js. */
const PHOTO_FALLBACK='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1b2430"/><g fill="none" stroke="#f290a6" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M200 150h48l24-36h96l24 36h48v130H200z"/><circle cx="320" cy="212" r="40"/></g></svg>');
function renderPhotos(){
  const grid=$('#photoGrid');
  if(!grid)return;
  const albums=Array.isArray(content().photos)?content().photos:[];
  grid.replaceChildren(...albums.map(album=>{
    const card=document.createElement('button');
    card.type='button';card.className='photo-card';
    card.setAttribute('aria-label',album.title+' — '+album.date+'. Открыть альбом');
    const media=document.createElement('span');media.className='photo-card__media';
    const img=document.createElement('img');img.src=album.cover||PHOTO_FALLBACK;img.alt='';img.loading='lazy';img.decoding='async';
    const tag=document.createElement('span');tag.className='photo-card__tag';
    tag.textContent=album.count?album.count+' ФОТО':'АЛЬБОМ';
    media.append(img,tag);
    const body=document.createElement('span');body.className='photo-card__body';
    const date=document.createElement('span');date.className='photo-card__date';date.textContent=album.date;
    const title=document.createElement('span');title.className='photo-card__name';title.textContent=album.title;
    const text=document.createElement('span');text.className='photo-card__text';text.textContent=album.description;
    body.append(date,title,text);
    card.append(media,body);
    card.addEventListener('click',()=>openAlbum(album));
    return card;
  }));
}
function openAlbum(album){
  const box=$('#photoDialogContent');box.replaceChildren();
  const wrap=document.createElement('div');wrap.className='photo-modal';
  const img=document.createElement('img');img.className='photo-modal__img';img.src=album.cover||PHOTO_FALLBACK;img.alt=album.title;img.decoding='async';
  const coverClose=document.createElement('button');coverClose.type='button';coverClose.className='photo-modal__close';
  coverClose.setAttribute('aria-label','Закрыть альбом');coverClose.textContent='✕';
  coverClose.addEventListener('click',()=>$('#photoDialog').close());
  const stage=document.createElement('div');stage.className='photo-modal__stage';
  stage.append(img,coverClose);
  const panel=document.createElement('div');panel.className='photo-modal__panel';
  const eyebrow=document.createElement('div');eyebrow.className='eyebrow';
  eyebrow.textContent='ФОТООТЧЕТ'+(album.count?' · '+album.count+' ФОТО':'');
  const title=document.createElement('h2');title.id='photoDialogTitle';title.textContent=album.title;
  const date=document.createElement('div');date.className='photo-modal__date';date.textContent=album.date;
  const desc=document.createElement('p');desc.className='photo-modal__desc';desc.textContent=album.description;
  const actions=document.createElement('div');actions.className='photo-modal__actions';
  if(album.yandexUrl){
    const disk=document.createElement('a');disk.className='btn primary';
    disk.href=album.yandexUrl;disk.target='_blank';disk.rel='noopener noreferrer';
    disk.textContent='Открыть на Яндекс.Диске ↗';
    actions.append(disk);
  }
  const close=document.createElement('button');close.type='button';close.className='btn outlined';close.textContent='Закрыть';
  close.addEventListener('click',()=>$('#photoDialog').close());
  actions.append(close);
  panel.append(eyebrow,title,date,desc,actions);
  wrap.append(stage,panel);
  box.append(wrap);
  $('#photoDialog').showModal();
}
renderPhotos();
renderEvents();
renderAdmins();
renderPartners();
$('#photoDialog').addEventListener('click',event=>{if(event.target===$('#photoDialog'))$('#photoDialog').close()});
/* Merch rail: side arrows scroll one card at a time and dim at the edges.
   A gentle auto-advance runs until the pointer rests on the module. */
const merchRail=$('#merchRail');
if(merchRail){
  const prevBtn=$('[data-merch-prev]'),nextBtn=$('[data-merch-next]'),merchBox=$('.merch-teaser');
  const gap=()=>parseFloat(getComputedStyle(merchRail).columnGap)||11;
  const step=()=>{
    const first=merchRail.firstElementChild;
    return (first?first.getBoundingClientRect().width:150)+gap();
  };
  const maxScroll=()=>merchRail.scrollWidth-merchRail.clientWidth;
  const atStart=()=>merchRail.scrollLeft<=4;
  const atEnd=()=>merchRail.scrollLeft>=maxScroll()-4;
  const sync=()=>{
    const room=maxScroll()>4;
    if(prevBtn)prevBtn.disabled=!room||atStart();
    if(nextBtn)nextBtn.disabled=!room||atEnd();
  };
  const nudge=dir=>{
    if(maxScroll()<=4)return;
    if(dir>0&&atEnd())return;
    if(dir<0&&atStart())return;
    merchRail.scrollBy({left:dir*step(),behavior:'smooth'});
  };
  if(prevBtn)prevBtn.addEventListener('click',()=>nudge(-1));
  if(nextBtn)nextBtn.addEventListener('click',()=>nudge(1));
  merchRail.addEventListener('scroll',()=>requestAnimationFrame(sync),{passive:true});
  window.addEventListener('resize',sync);
  sync();
  let resting=false;
  if(merchBox){
    merchBox.addEventListener('pointerenter',()=>{resting=true});
    merchBox.addEventListener('pointerleave',()=>{resting=false});
    merchBox.addEventListener('focusin',()=>{resting=true});
    merchBox.addEventListener('focusout',()=>{resting=false});
    merchBox.addEventListener('touchstart',()=>{resting=true},{passive:true});
    merchBox.addEventListener('touchend',()=>{resting=false},{passive:true});
  }
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    setInterval(()=>{
      if(resting||document.hidden||current!=='home'||maxScroll()<=4)return;
      if(atEnd()){merchRail.scrollTo({left:0,behavior:'smooth'});return}
      nudge(1);
    },4500);
  }
}
document.addEventListener('content:changed',()=>{
  renderNews();renderEvents();renderAdmins();renderPartners();renderPhotos();renderMerch();
  window.dispatchEvent(new Event('resize'));
});
if('serviceWorker' in navigator && location.protocol==='https:'){
 navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('SW:',err));
}
})();