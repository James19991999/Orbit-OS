// Demo mode narration: what the voice says on each screen, in English, Kiswahili and French.
// Keep lines short (one or two sentences): they are spoken one at a time and shown as captions.
// Only describe what is really on the screen. Kiswahili/French are machine-assisted drafts.
import type { Language } from '@/i18n/shared';

export interface DemoLine { text: Record<Language, string>; target?: string }
export interface DemoScreen { id: string; href: string; title: Record<Language, string>; lines: DemoLine[]; next?: string }
const l = (en: string, sw: string, fr: string, target?: string): DemoLine => ({ text: { en, sw, fr }, target });
const t = (en: string, sw: string, fr: string): Record<Language, string> => ({ en, sw, fr });

export const DEMO: DemoScreen[] = [
  {
    id: 'dashboard', href: '/dashboard', next: 'my-day', title: t('Dashboard', 'Dashibodi', 'Tableau de bord'),
    lines: [
      l('Welcome to OrbitOS, the operating system for remote and hybrid teams in Africa.', 'Karibu OrbitOS, mfumo wa uendeshaji kwa timu za mbali na mseto barani Afrika.', 'Bienvenue sur OrbitOS, le système d’exploitation des équipes à distance et hybrides en Afrique.'),
      l('Most growing companies juggle five tools: tasks, meetings, spreadsheets, WhatsApp approvals and invoices. OrbitOS brings them into one place, priced in shillings.', 'Kampuni nyingi zinazokua hutumia zana tano: kazi, mikutano, majedwali, idhini za WhatsApp na ankara. OrbitOS inaziweka mahali pamoja, kwa bei ya shilingi.', 'La plupart des entreprises jonglent avec cinq outils : tâches, réunions, tableurs, approbations WhatsApp et factures. OrbitOS réunit tout, avec des prix en shillings.'),
      l('This is the founder’s view. The Company Health Index combines delivery, runway, culture and compliance into one score.', 'Huu ni mtazamo wa mwanzilishi. Kiashiria cha Afya ya Kampuni kinaunganisha utekelezaji, akiba ya fedha, utamaduni na utiifu kuwa alama moja.', 'Voici la vue du dirigeant. L’indice de santé combine livraison, trésorerie, culture et conformité en un seul score.'),
      l('Urgent actions show what needs a decision today, and the overlap window shows when the team is online together across time zones.', 'Hatua za dharura zinaonyesha kinachohitaji uamuzi leo, na muda wa pamoja unaonyesha timu iko mtandaoni pamoja lini katika saa za kanda tofauti.', 'Les actions urgentes montrent ce qui demande une décision aujourd’hui, et la plage commune indique quand l’équipe est en ligne ensemble malgré les fuseaux.'),
      l('Every Monday, an AI chief of staff writes a short brief: wins, risks and blockers from the team’s own check-ins.', 'Kila Jumatatu, mkuu wa wafanyakazi wa AI huandika muhtasari mfupi: mafanikio, hatari na vizuizi kutoka ripoti za timu yenyewe.', 'Chaque lundi, un chef de cabinet IA rédige un court brief : réussites, risques et blocages tirés des points de l’équipe.'),
    ],
  },
  {
    id: 'my-day', href: '/my-day', next: 'operations', title: t('My day', 'Siku yangu', 'Ma journée'),
    lines: [
      l('My day is everyone’s own starting point: my tasks, today’s meetings, my check-in, approvals waiting, mentions and who’s away.', 'Siku yangu ni mahali pa kuanzia pa kila mtu: kazi zangu, mikutano ya leo, ripoti yangu, idhini zinazosubiri, nilipotajwa na nani yuko likizo.', 'Ma journée est le point de départ de chacun : mes tâches, les réunions du jour, mon point, les approbations en attente, les mentions et les absents.'),
      l('On a phone, swipe a task right to finish it, with an undo if you change your mind.', 'Kwenye simu, telezesha kazi kulia kuimaliza, na unaweza kutendua ukibadilisha nia.', 'Sur téléphone, balayez une tâche vers la droite pour la terminer, avec possibilité d’annuler.', '[data-task-row]'),
    ],
  },
  {
    id: 'operations', href: '/operations', next: 'finance', title: t('Projects & Sprints', 'Miradi na Sprint', 'Projets et sprints'),
    lines: [
      l('Operations is where the work lives: sprints and a board you can drag tasks across.', 'Operesheni ndipo kazi ilipo: sprint na ubao ambapo unaburuta kazi.', 'Opérations, c’est là que vit le travail : des sprints et un tableau où l’on déplace les tâches.'),
      l('Start from a template, like employee onboarding, month-end close or KRA monthly returns, and the whole list is created with dates.', 'Anza kutoka kiolezo, kama kumkaribisha mfanyakazi, kufunga mwezi au ritani za KRA za kila mwezi, na orodha nzima inaundwa pamoja na tarehe.', 'Partez d’un modèle — intégration, clôture mensuelle ou déclarations KRA — et toute la liste est créée avec ses dates.'),
      l('Or import tasks and people straight from Excel. Comments with mentions keep discussions on the task, not lost in WhatsApp.', 'Au leta kazi na watu moja kwa moja kutoka Excel. Maoni yenye kutaja watu huweka mazungumzo kwenye kazi, si kupotea WhatsApp.', 'Ou importez tâches et personnes depuis Excel. Les commentaires avec mentions gardent les échanges sur la tâche, pas perdus dans WhatsApp.'),
    ],
  },
  {
    id: 'finance', href: '/operations?tab=finance', next: 'scheduling', title: t('Finance & Runway', 'Fedha', 'Finances et trésorerie'),
    lines: [
      l('Finance shows cash, burn and runway. Expenses above a limit need approval, and nobody can approve their own.', 'Fedha inaonyesha pesa taslimu, matumizi na akiba ya muda. Gharama zinazozidi kikomo zinahitaji idhini, na hakuna anayeidhinisha yake mwenyewe.', 'Les finances montrent trésorerie, consommation et autonomie. Au-delà d’un seuil, une dépense doit être approuvée, et personne n’approuve la sienne.', '#approvals'),
      l('Invoices go out with an M-Pesa or card payment link, are marked paid automatically, and are sent to KRA eTIMS.', 'Ankara hutumwa na kiungo cha malipo cha M-Pesa au kadi, huwekwa kuwa zimelipwa zenyewe, na hutumwa kwa KRA eTIMS.', 'Les factures partent avec un lien de paiement M-Pesa ou carte, passent en payées automatiquement et sont transmises à KRA eTIMS.'),
      l('And you can pay many people at once with M-Pesa payouts.', 'Na unaweza kulipa watu wengi kwa pamoja kwa malipo ya M-Pesa.', 'Et vous pouvez payer plusieurs personnes en une fois avec les paiements M-Pesa.'),
    ],
  },
  {
    id: 'scheduling', href: '/scheduling', next: 'culture', title: t('Scheduling', 'Ratiba', 'Planning'),
    lines: [
      l('Scheduling finds meeting times that fit everyone’s working hours, skips people on leave, and syncs with Google Calendar and Outlook.', 'Ratiba hupata nyakati za mikutano zinazofaa saa za kazi za kila mtu, huwaruka walio likizo, na huungana na Google Calendar na Outlook.', 'Le planning trouve des créneaux compatibles avec les heures de chacun, écarte les absents et se synchronise avec Google Agenda et Outlook.'),
    ],
  },
  {
    id: 'culture', href: '/culture', next: 'leave', title: t('Culture', 'Utamaduni', 'Culture'),
    lines: [
      l('Culture keeps a remote team connected: a daily check-in people can answer straight from WhatsApp, kudos, channels and a weekly pulse.', 'Utamaduni huiweka timu ya mbali pamoja: ripoti ya kila siku ambayo watu hujibu moja kwa moja kutoka WhatsApp, pongezi, chaneli na kura ya mapigo ya kila wiki.', 'La culture garde l’équipe soudée : un point quotidien auquel on répond directement depuis WhatsApp, des bravos, des canaux et un baromètre hebdomadaire.', '#roll-call'),
    ],
  },
  {
    id: 'leave', href: '/people?tab=leave', next: 'automations', title: t('Time off', 'Likizo', 'Congés'),
    lines: [
      l('Time off: request leave, managers approve, and working days are counted for you.', 'Likizo: omba likizo, mameneja huidhinisha, na siku za kazi huhesabiwa kwa ajili yako.', 'Congés : on demande, le manager approuve, et les jours ouvrés sont comptés automatiquement.'),
      l('Before you go, Handover picks who covers and moves the tasks due while you’re away, in one step.', 'Kabla hujaondoka, Makabidhiano humchagua atakayeshughulikia kazi zako na kumhamishia kazi zinazotakiwa ukiwa haupo, kwa hatua moja.', 'Avant de partir, la passation désigne un remplaçant et lui transfère en une fois les tâches à échéance pendant l’absence.'),
    ],
  },
  {
    id: 'automations', href: '/settings#automations', next: 'help', title: t('Automations', 'Mitambo ya kiotomatiki', 'Automatisations'),
    lines: [
      l('Automations do the chasing for you: a first-week checklist for every new hire, reminders for late tasks, and polite reminders to clients about unpaid invoices.', 'Mitambo ya kiotomatiki hufuatilia kwa ajili yako: orodha ya wiki ya kwanza kwa kila mfanyakazi mpya, vikumbusho vya kazi zilizochelewa, na vikumbusho vya heshima kwa wateja kuhusu ankara ambazo hazijalipwa.', 'Les automatisations relancent pour vous : une checklist de première semaine pour chaque recrue, des rappels de retard, et des relances polies aux clients pour les factures impayées.', '#automations'),
      l('Messages only go out on weekdays, in working hours, in each person’s own time zone.', 'Ujumbe hutumwa siku za kazi tu, wakati wa saa za kazi, katika saa za kanda za kila mtu.', 'Les messages ne partent qu’en semaine, aux heures de travail, dans le fuseau de chacun.'),
      l('You can also add your own logo and colours, and require two-factor sign-in for every manager.', 'Unaweza pia kuongeza nembo na rangi zako, na kulazimisha uthibitishaji wa hatua mbili kwa kila meneja.', 'Vous pouvez aussi ajouter votre logo et vos couleurs, et imposer la double authentification à chaque manager.'),
    ],
  },
  {
    id: 'help', href: '/help', title: t('Help centre', 'Kituo cha msaada', 'Centre d’aide'),
    lines: [
      l('And if anyone gets stuck, the help centre answers in English, Kiswahili or French, from our own guides.', 'Na mtu akikwama, kituo cha msaada hujibu kwa Kiingereza, Kiswahili au Kifaransa, kutoka kwa miongozo yetu.', 'Et si quelqu’un bloque, le centre d’aide répond en anglais, kiswahili ou français, à partir de nos guides.'),
      l('OrbitOS starts from 4,900 shillings a month, with a 14-day free trial, paid by M-Pesa or card. Try it today, the link is in the comments.', 'OrbitOS huanzia shilingi 4,900 kwa mwezi, na majaribio ya bure ya siku 14, kulipa kwa M-Pesa au kadi. Ijaribu leo, kiungo kiko kwenye maoni.', 'OrbitOS commence à 4 900 shillings par mois, avec 14 jours d’essai gratuit, payable par M-Pesa ou carte. Essayez dès aujourd’hui, le lien est en commentaire.'),
    ],
  },
];

/** The demo screen for a URL (the tab in the query string matters; the #hash picks a section). */
export function screenFor(pathname: string, search: string, hash = ''): DemoScreen | undefined {
  const tab = new URLSearchParams(search).get('tab');
  if (pathname === '/operations') return DEMO.find((s) => s.id === (tab === 'finance' ? 'finance' : 'operations'));
  if (pathname === '/people') return tab === 'leave' ? DEMO.find((s) => s.id === 'leave') : undefined;
  if (pathname === '/settings') return hash === '#automations' || !hash ? DEMO.find((s) => s.id === 'automations') : undefined;
  return DEMO.find((s) => s.href === pathname);
}
