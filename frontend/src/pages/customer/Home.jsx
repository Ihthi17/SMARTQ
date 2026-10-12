import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ListChecks, ShieldCheck } from 'lucide-react';
import api from '../../api/axiosInstance';

const features = [
  {
    title: 'Reserve a time',
    description: 'Select the service and appointment time that works for you.',
    Icon: CalendarDays,
  },
  {
    title: 'No account required',
    description: 'Use your booking reference or tracking link to manage the visit.',
    Icon: ShieldCheck,
  },
  {
    title: 'Follow your queue',
    description: 'See the current token, next queue, and wait progress in real time.',
    Icon: ListChecks,
  },
];

export default function Home() {
  const [branding, setBranding] = useState({ appName: 'Smart Queue', logo: '' });

  useEffect(() => {
    let active = true;
    const loadBranding = () => {
      api.get('/settings/branding')
        .then(({ data }) => {
          if (active) {
            setBranding({
              appName: data.appName || 'Smart Queue',
              logo: data.logo || '',
            });
          }
        })
        .catch(error => {
          if (active) console.error('Could not load application branding:', error);
        });
    };
    loadBranding();
    window.addEventListener('smartqueue:branding-updated', loadBranding);
    return () => {
      active = false;
      window.removeEventListener('smartqueue:branding-updated', loadBranding);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="h-[60px] border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label={`${branding.appName} home`} className="flex items-center gap-2 text-sm font-bold text-teal-800">
            {branding.logo
              ? <img src={branding.logo} alt="" className="h-7 max-w-9 object-contain" />
              : <span className="flex h-7 w-5 items-center justify-center rounded-md bg-teal-600 text-[10px] font-bold text-white">S</span>}
            <span>{branding.appName}</span>
          </Link>
          <Link to="/queue-display" className="text-xs font-medium text-slate-700 transition hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600">
            Live queue
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-10 pt-14 sm:px-8 sm:pt-[60px]">
        <section aria-labelledby="home-title">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">
            Simple service appointments
          </p>
          <h1 id="home-title" className="mt-4 max-w-4xl text-4xl font-extrabold leading-[1.04] tracking-tight text-slate-950 sm:text-[44px]">
            Appointments without the waiting room.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Choose a service, reserve a time, and check in when you arrive. You can follow your token live without creating a customer account.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              to="/book-appointment"
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Book an appointment <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link
              to="/queue-display"
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-teal-600 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              View live queue <ListChecks size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section aria-label="How Smart Queue works" className="mt-10 grid gap-3 sm:grid-cols-3">
          {features.map(({ title, description, Icon }) => (
            <article key={title} className="min-h-[122px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <Icon size={17} strokeWidth={2} aria-hidden="true" className="text-teal-600" />
              <h2 className="mt-3 text-xs font-semibold text-slate-900">{title}</h2>
              <p className="mt-1.5 text-[11px] leading-[1.55] text-slate-500">{description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
