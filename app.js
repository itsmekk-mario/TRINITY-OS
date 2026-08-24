function tab(x){document.querySelectorAll('.page').forEach(e=>e.classList.add('hidden'));document.getElementById(x).classList.remove('hidden')}
let sec=0,timer;
function startTimer(){if(timer)return;timer=setInterval(()=>{sec++;let h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;clock.innerText=[h,m,s].map(x=>String(x).padStart(2,'0')).join(':')},1000)}
function stopTimer(){clearInterval(timer);timer=null;let a=JSON.parse(localStorage.time||'[]');a.push({subject:subject.value,time:sec});localStorage.time=JSON.stringify(a);timeList.innerHTML=JSON.stringify(a);}

function saveCalendar(){let a=JSON.parse(localStorage.calendar||'[]');a.push({date:calDate.value,text:calText.value});localStorage.calendar=JSON.stringify(a);location.reload()}
function saveScore(){let a=JSON.parse(localStorage.score||'[]');a.push({exam:exam.value,date:date.value,kor:kor.value,math:math.value,eng:eng.value,mistake:mistake.value});localStorage.score=JSON.stringify(a);scoreList.innerHTML=JSON.stringify(a)}
function saveJournal(){let a=JSON.parse(localStorage.journal||'[]');a.push(journalText.value);localStorage.journal=JSON.stringify(a);journalList.innerHTML=JSON.stringify(a)}
