'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Icon, cn } from '@/components/ui';
import { chaptersFor, linesFor, nextFor, screenFor, type DemoScreen } from '@/lib/demo/script';
import type { Role } from '@/lib/types';
import { useLang, useT } from '@/i18n/client';
import type { Language } from '@/i18n/shared';

const KEY = 'orbit_demo';
const SPEECH_LANG: Record<Language, string> = { en: 'en-GB', sw: 'sw-KE', fr: 'fr-FR' };
interface Saved { on: boolean; lang: Language; rate: number; voice: string; muted: boolean; hidden: boolean }
const load = (fallback: Language): Saved => {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return { on: false, lang: fallback, rate: 1, voice: '', muted: false, hidden: false, ...v }; } catch { /* private mode */ }
  return { on: false, lang: fallback, rate: 1, voice: '', muted: false, hidden: false };
};
/**
 * Phones only let a page start speaking from inside a tap. Speaking a silent sound during the tap "unlocks" the voice
 * for the rest of the demo (Safari on iPhone and Chrome on Android both need this; desktop browsers usually don't).
 */
function primeSpeech() {
  try {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch { /* ignore */ }
}
const editable = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Pick the most natural voice for a language: the one chosen before, else "Natural/Online/Neural" voices, else Kenya, else any. */
function pickVoice(voices: SpeechSynthesisVoice[], lang: Language, preferred: string) {
  const mine = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  return mine.find((v) => v.voiceURI === preferred)
    ?? mine.find((v) => /natural|online|neural/i.test(v.name) && /-KE/i.test(v.lang))
    ?? mine.find((v) => /natural|online|neural/i.test(v.name))
    ?? mine.find((v) => /-KE/i.test(v.lang)) ?? mine[0];
}

/**
 * Demo mode (founders only): a voice explains each screen as you open it, with captions for people watching muted and a
 * soft highlight on what it's talking about. Space pauses, → / ← move between points, M mutes, H hides the controls,
 * Shift+Esc ends the demo. Uses the browser's own voices, so it works offline and costs nothing.
 */
export function DemoNarrator({ role, founder }: { role: Role; founder: boolean }) {
  const t = useT();
  const uiLang = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [s, setS] = useState<Saved>(() => ({ on: false, lang: uiLang, rate: 1, voice: '', muted: false, hidden: false }));
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [blocked, setBlocked] = useState(false);   // the phone refused to speak until tapped
  const [retry, setRetry] = useState(0);
  const [canSpeak, setCanSpeak] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);   // bumps on every new line, so late events from an old line are ignored

  // Restore after navigation/reload; start from ?demo=1 or the "Start demo mode" command.
  useEffect(() => {
    const saved = load(uiLang);
    if (new URLSearchParams(window.location.search).get('demo') === '1') saved.on = true;
    setS(saved);
    setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window);
    // The start buttons fire this event inside the tap, so the voice can be unlocked right here.
    const start = () => { primeSpeech(); setS((x) => ({ ...x, on: true })); };
    window.addEventListener('orbit:demo', start);
    return () => window.removeEventListener('orbit:demo', start);
  }, [uiLang]);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }, [s]);

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener?.('voiceschanged', update);
    return () => synth.removeEventListener?.('voiceschanged', update);
  }, []);

  const screen: DemoScreen | undefined = useMemo(() => (s.on ? screenFor(pathname, search.toString()) : undefined), [s.on, pathname, search]);
  const lines = useMemo(() => (screen ? linesFor(screen, founder) : []), [screen, founder]);
  const chapters = useMemo(() => chaptersFor(role), [role]);
  const nextScreen = screen ? nextFor(screen.id, role) : undefined;
  const line = lines[i];
  const done = !!screen && i >= lines.length;

  const speakingLine = useRef(false);   // only our own sentences are cancelled, never the silent unlock sound
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (speakingLine.current) { speakingLine.current = false; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
  }, []);

  // A new screen starts from its first point.
  useEffect(() => { setI(0); setPlaying(true); }, [screen?.id]);

  // Say (or caption) the current point, then move on by itself while playing.
  useEffect(() => {
    stop();
    if (!s.on || !screen || !line || !playing) return;
    const id = ++run.current;
    const advance = () => { if (run.current === id) timer.current = setTimeout(() => setI((x) => x + 1), 450); };
    const text = line.text[s.lang];
    const synth = window.speechSynthesis;
    const voice = pickVoice(voices, s.lang, s.voice);
    if (s.muted || !synth || !voice && voices.length > 0) {
      // Captions only: give people time to read (about 3 words a second).
      timer.current = setTimeout(advance, Math.max(3500, (text.split(/\s+/).length / 3) * 1000) / s.rate);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? SPEECH_LANG[s.lang];
    if (voice) u.voice = voice;
    u.rate = s.rate;
    let started = false;
    let safety: ReturnType<typeof setTimeout> | undefined;
    u.onstart = () => { started = true; setBlocked(false); };
    u.onend = () => { speakingLine.current = false; advance(); };
    u.onerror = (e) => {
      if (e.error === 'not-allowed') { clearTimeout(safety); setBlocked(true); return; }   // needs a tap first
      if (e.error !== 'interrupted' && e.error !== 'canceled') timer.current = setTimeout(advance, 3000);
    };
    // A phone that silently refuses never starts: ask for a tap instead of skipping ahead without sound.
    const check = setTimeout(() => { if (run.current === id && !started && !synth.speaking) { clearTimeout(safety); setBlocked(true); } }, 2500);
    // Some browsers never fire "end": fall back to a reading-time timer once speech has started.
    safety = setTimeout(() => { if (run.current === id && started && !synth.speaking) advance(); }, Math.max(6000, text.length * 120) / s.rate);
    speakingLine.current = true;
    synth.speak(u);
    return () => { clearTimeout(safety); clearTimeout(check); };
  }, [s.on, s.lang, s.muted, s.rate, s.voice, screen, line, playing, voices, stop, retry]);

  const tapForSound = () => { primeSpeech(); setBlocked(false); setPlaying(true); setRetry((x) => x + 1); };

  // Highlight what the voice is talking about (never blocks clicks), and bring it into view.
  useEffect(() => {
    if (!line?.target) { setBox(null); return; }
    const el = document.querySelector<HTMLElement>(line.target);
    if (!el) { setBox(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const update = () => setBox(el.getBoundingClientRect());
    const id = setTimeout(update, 400);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { clearTimeout(id); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [line]);

  const end = useCallback(() => { stop(); setBox(null); setS((x) => ({ ...x, on: false })); }, [stop]);

  useEffect(() => {
    if (!s.on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && e.shiftKey) { e.preventDefault(); end(); return; }
      if (editable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(true); setI((x) => Math.min(x + 1, lines.length)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(true); setI((x) => Math.max(x - 1, 0)); }
      else if (k === 'm') setS((x) => ({ ...x, muted: !x.muted }));
      else if (k === 'h') setS((x) => ({ ...x, hidden: !x.hidden }));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [s.on, lines.length, end]);

  useEffect(() => () => stop(), [stop]);
  if (!s.on) return null;

  const langVoices = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(s.lang));
  const current = pickVoice(voices, s.lang, s.voice);
  const btn = 'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded px-2 text-label-md text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';
  const caption = line ? line.text[s.lang] : screen ? null : t('demo.no_script');

  return (
    <>
      {box && (
        <div aria-hidden data-testid="demo-highlight" className="pointer-events-none fixed z-[64] rounded-lg ring-4 ring-primary-container/80 transition-all duration-300 motion-safe:animate-pulse"
          style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }} />
      )}
      <div role="region" aria-label={t('demo.region')} data-testid="demo" className="fixed inset-x-0 bottom-20 z-[65] flex justify-center px-3 lg:bottom-6 lg:pl-64">
        <div className="w-full max-w-3xl rounded-xl bg-slate-950/90 px-5 py-4 text-white shadow-l2 backdrop-blur" lang={s.lang}>
          {screen && <p className="text-label-xs uppercase tracking-wide text-white/60">{screen.title[s.lang]}{!done && ` · ${Math.min(i + 1, lines.length)}/${lines.length}`}</p>}
          {caption && <p className="mt-1 text-[1.15rem] leading-snug md:text-[1.3rem]" data-testid="demo-caption">{caption}</p>}
          {blocked && !s.muted && (
            <button type="button" onClick={tapForSound} className="mt-3 inline-flex items-center gap-2 rounded bg-white px-4 py-3 text-label-md text-slate-950 hover:bg-white/90">
              <Icon name="volume_up" />{t('demo.tap_sound')}
            </button>
          )}
          {!canSpeak && <p className="mt-2 text-body-sm text-amber-200">{t('demo.no_speech')}</p>}
          {done && (
            nextScreen
              ? <button type="button" className="mt-2 inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-label-md text-slate-950 hover:bg-white/90"
                  onClick={() => router.push(nextScreen.href!)}>
                  {t('demo.next_screen', { screen: nextScreen.title[s.lang] })}<Icon name="arrow_forward" />
                </button>
              : <p className="mt-1 text-[1.15rem]" data-testid="demo-caption">{t('demo.the_end')}</p>
          )}
          {!s.hidden && (
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-white/15 pt-3">
              <button type="button" className={btn} onClick={() => { primeSpeech(); setPlaying(true); setI((x) => Math.max(x - 1, 0)); }} aria-label={t('demo.prev')}><Icon name="skip_previous" /></button>
              <button type="button" className={btn} onClick={() => { primeSpeech(); setPlaying((p) => !p); }} aria-label={playing ? t('demo.pause') : t('demo.play')} aria-pressed={!playing}><Icon name={playing ? 'pause' : 'play_arrow'} /></button>
              <button type="button" className={btn} onClick={() => { primeSpeech(); setPlaying(true); setI((x) => Math.min(x + 1, lines.length)); }} aria-label={t('demo.next')}><Icon name="skip_next" /></button>
              <button type="button" className={btn} onClick={() => { primeSpeech(); setS((x) => ({ ...x, muted: !x.muted })); }} aria-label={s.muted ? t('demo.unmute') : t('demo.mute')} aria-pressed={s.muted}><Icon name={s.muted ? 'volume_off' : 'volume_up'} /></button>
              <label className="ml-1 flex items-center gap-1 text-body-sm text-white/80">
                <span className="sr-only">{t('demo.chapters')}</span>
                <select value={screen?.tour ? screen.id : ''} onChange={(e) => { const c = chapters.find((x) => x.id === e.target.value); if (c?.href) router.push(c.href); }}
                  className="h-9 max-w-[11rem] rounded bg-white/10 px-2 text-white [&>option]:text-slate-950">
                  {!screen?.tour && <option value="">{t('demo.chapters')}</option>}
                  {chapters.map((c, n) => <option key={c.id} value={c.id}>{n + 1}. {c.title[s.lang]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 text-body-sm text-white/80">
                <span className="sr-only">{t('demo.language')}</span>
                <select value={s.lang} onChange={(e) => setS((x) => ({ ...x, lang: e.target.value as Language, voice: '' }))} className="h-9 rounded bg-white/10 px-2 text-white [&>option]:text-slate-950">
                  <option value="en">English</option><option value="sw">Kiswahili</option><option value="fr">Français</option>
                </select>
              </label>
              {langVoices.length > 1 && (
                <label className="flex items-center gap-1 text-body-sm text-white/80">
                  <span className="sr-only">{t('demo.voice')}</span>
                  <select value={current?.voiceURI ?? ''} onChange={(e) => setS((x) => ({ ...x, voice: e.target.value }))} className="h-9 max-w-[12rem] rounded bg-white/10 px-2 text-white [&>option]:text-slate-950">
                    {langVoices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1 text-body-sm text-white/80">
                <span className="sr-only">{t('demo.speed')}</span>
                <select value={s.rate} onChange={(e) => setS((x) => ({ ...x, rate: Number(e.target.value) }))} className="h-9 rounded bg-white/10 px-2 text-white [&>option]:text-slate-950">
                  <option value={0.85}>0.85×</option><option value={1}>1×</option><option value={1.15}>1.15×</option>
                </select>
              </label>
              {!s.muted && voices.length > 0 && langVoices.length === 0 && <span className="text-body-sm text-amber-200">{t('demo.no_voice')}</span>}
              <span className="ml-auto hidden text-body-sm text-white/60 md:inline">{t('demo.keys')}</span>
              <button type="button" className={cn(btn, 'ml-1')} onClick={end} aria-label={t('demo.end')}><Icon name="close" /></button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
