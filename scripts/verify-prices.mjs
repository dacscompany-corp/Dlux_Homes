import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const PH_HOLIDAYS = new Set(["2026-12-25"]); // sample
const isWeekend = (iso) => { if (PH_HOLIDAYS.has(iso)) return true; const d=new Date(iso+"T00:00:00"); const w=d.getDay(); return w===0||w===5||w===6; };
const addDays=(iso,n)=>{const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
try {
  const h = (await pool.query("SELECT haven_name, six_hour_rate, ten_hour_rate, weekday_rate, weekend_rate FROM havens LIMIT 1")).rows[0];
  // Adapter mapping:
  const R = { price10hr: +h.ten_hour_rate, price10hrWeekend: +h.six_hour_rate, price21hr: +h.weekday_rate, price21hrWeekend: +h.weekend_rate };
  const pick = (stay,iso)=> stay==="10" ? (isWeekend(iso)?R.price10hrWeekend:R.price10hr) : (isWeekend(iso)?R.price21hrWeekend:R.price21hr);
  const stayTotal=(stay,iso,nights)=>{ if(stay==="10")return pick("10",iso); let t=0; for(let i=0;i<nights;i++)t+=pick("21",addDays(iso,i)); return t; };
  console.log("Haven:", h.haven_name, "\nDB rates:", h, "\n");
  console.log("Card says: 10h wkdy 1499 / wknd 1799   |   21h wkdy 1899 / wknd 2099\n");
  const mon="2026-06-22", sat="2026-06-27", sun="2026-06-21"; // Mon, Sat, Sun
  console.log("10h Daycation — Mon (weekday):", pick("10",mon), "  Sat (weekend):", pick("10",sat));
  console.log("21h Overnight — Mon (weekday):", pick("21",mon), "  Sat (weekend):", pick("21",sat));
  console.log("21h 2 nights Sun→Tue (Sun wknd 2099 + Mon wkdy 1899):", stayTotal("21",sun,2));
  console.log("21h DP (50% of weekday):", Math.round(pick("21",mon)*0.5), " + ₱1000 deposit at check-in");
} catch(e){console.error("ERR:",e.message);} finally{await pool.end();}
