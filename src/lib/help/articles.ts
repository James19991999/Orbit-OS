// Help centre articles. Short, practical, in English, Kiswahili and French. The AI assistant answers ONLY from these,
// so keep them accurate when features change. Kiswahili/French are machine-assisted drafts.
import type { Language } from '@/i18n/shared';

type L = Record<Language, string>;
type LP = Record<Language, string[]>;
export interface Article { id: string; icon: string; title: L; body: LP; keywords: string }
const l = (en: string, sw: string, fr: string): L => ({ en, sw, fr });
const p = (en: string[], sw: string[], fr: string[]): LP => ({ en, sw, fr });

export const ARTICLES: Article[] = [
  {
    id: 'getting-started', icon: 'rocket_launch', keywords: 'start setup invite team roles owner director contributor auditor seats join',
    title: l('Getting started: invite your team', 'Kuanza: alika timu yako', 'Bien démarrer : invitez votre équipe'),
    body: p(
      ['Go to Settings → Role-based access & members and choose Invite. Enter the person’s work email and a role. They get an email and a link you can also share on WhatsApp.',
        'Roles: Owner (everything, including billing), Director (manages people, approvals and settings), Contributor (does the work), Auditor (read-only for compliance reviews).',
        'You can import many people at once from Excel or CSV with Import people. Each plan has a number of seats; you can add seats under Settings → Billing.'],
      ['Nenda Mipangilio → Ufikiaji kwa majukumu na wanachama na uchague Alika. Weka barua pepe ya kazi ya mtu na wadhifa. Atapokea barua pepe na kiungo ambacho unaweza pia kutuma kwa WhatsApp.',
        'Wadhifa: Mmiliki (kila kitu, ikiwemo malipo), Mkurugenzi (husimamia watu, idhini na mipangilio), Mchangiaji (hufanya kazi), Mkaguzi (kusoma tu kwa ukaguzi wa utiifu).',
        'Unaweza kuingiza watu wengi kwa pamoja kutoka Excel au CSV kwa Leta watu. Kila mpango una idadi ya nafasi; unaweza kuongeza nafasi chini ya Mipangilio → Malipo.'],
      ['Allez dans Paramètres → Accès par rôle et membres et choisissez Inviter. Saisissez l’e-mail professionnel et un rôle. La personne reçoit un e-mail et un lien que vous pouvez aussi partager sur WhatsApp.',
        'Rôles : Propriétaire (tout, y compris la facturation), Directeur (gère les personnes, approbations et paramètres), Contributeur (réalise le travail), Auditeur (lecture seule pour les contrôles de conformité).',
        'Vous pouvez importer plusieurs personnes depuis Excel ou CSV avec Importer des personnes. Chaque formule inclut un nombre de sièges ; ajoutez-en dans Paramètres → Facturation.']),
  },
  {
    id: 'tasks', icon: 'view_kanban', keywords: 'task tasks sprint board kanban template import excel csv comment mention undo delete due date',
    title: l('Tasks, sprints and templates', 'Kazi, sprint na violezo', 'Tâches, sprints et modèles'),
    body: p(
      ['Create tasks under Operations → Projects & Sprints with New task, or press N anywhere. Drag cards between columns to change their status.',
        'Use a template creates a ready-made list (employee onboarding, month-end close, KRA monthly returns and more) dated from a start date you choose.',
        'Import tasks from Excel, CSV or rows pasted from a spreadsheet. On a task, write comments and type @ to mention a teammate. Deleted a task by mistake? Choose Undo within 10 minutes.'],
      ['Unda kazi chini ya Operesheni → Miradi na Sprint kwa Kazi mpya, au bonyeza N popote. Buruta kadi kati ya safu kubadilisha hali yake.',
        'Tumia kiolezo huunda orodha tayari (kumkaribisha mfanyakazi, kufunga mwezi, ritani za KRA za kila mwezi na zaidi) kuanzia tarehe unayochagua.',
        'Ingiza kazi kutoka Excel, CSV au safu zilizobandikwa kutoka jedwali. Kwenye kazi, andika maoni na uandike @ kumtaja mwenzako. Umefuta kazi kimakosa? Chagua Tendua ndani ya dakika 10.'],
      ['Créez des tâches dans Opérations → Projets et sprints avec Nouvelle tâche, ou appuyez sur N n’importe où. Glissez les cartes entre les colonnes pour changer leur statut.',
        'Utiliser un modèle crée une liste prête (intégration d’un employé, clôture mensuelle, déclarations KRA mensuelles…) datée à partir du jour choisi.',
        'Importez des tâches depuis Excel, CSV ou des lignes collées d’un tableur. Sur une tâche, commentez et tapez @ pour mentionner un collègue. Tâche supprimée par erreur ? Choisissez Annuler dans les 10 minutes.']),
  },
  {
    id: 'checkins', icon: 'edit_note', keywords: 'check-in checkin daily standup whatsapp reply reminder roll call blockers',
    title: l('Daily check-ins and WhatsApp', 'Ripoti za kila siku na WhatsApp', 'Points quotidiens et WhatsApp'),
    body: p(
      ['Each day people share what they did, what’s next and anything blocking them, under Culture → Async roll call or from My day.',
        'Link WhatsApp in your Profile to get the reminder on WhatsApp and reply there; your answer becomes your check-in. Reminders go out at 16:00 your time on weekdays if you haven’t checked in.',
        'Managers see blockers on the dashboard and in the weekly AI brief.'],
      ['Kila siku watu hueleza walichofanya, kinachofuata na kinachowazuia, chini ya Utamaduni → Mahudhurio yasiyo ya wakati mmoja au kutoka Siku yangu.',
        'Unganisha WhatsApp kwenye Wasifu wako upate kikumbusho kwa WhatsApp na ujibu hapo; jibu lako linakuwa ripoti yako. Vikumbusho hutumwa saa 16:00 kwa saa zako siku za kazi kama hujatuma ripoti.',
        'Mameneja huona vizuizi kwenye dashibodi na kwenye muhtasari wa AI wa kila wiki.'],
      ['Chaque jour, chacun partage ce qu’il a fait, la suite et ce qui le bloque, dans Culture → Appel asynchrone ou depuis Ma journée.',
        'Associez WhatsApp dans votre profil pour recevoir le rappel sur WhatsApp et y répondre : votre réponse devient votre point. Les rappels partent à 16 h (votre heure) en semaine si vous n’avez pas encore répondu.',
        'Les managers voient les blocages sur le tableau de bord et dans le brief IA hebdomadaire.']),
  },
  {
    id: 'meetings', icon: 'event', keywords: 'meeting schedule time zone calendar google outlook sync invite slot busy video',
    title: l('Meetings across time zones', 'Mikutano katika saa za kanda tofauti', 'Réunions entre fuseaux horaires'),
    body: p(
      ['Under Scheduling, choose New meeting. OrbitOS suggests times when everyone is within working hours and not on leave or busy.',
        'Connect Google Calendar or Outlook in your Profile so your busy times are respected and meetings appear in your calendar. Invitations include a calendar file.',
        'Add a video link (Google Meet, Zoom, Teams) and people can join from My day.'],
      ['Chini ya Ratiba, chagua Mkutano mpya. OrbitOS hupendekeza nyakati ambapo kila mtu yuko ndani ya saa za kazi na hayuko likizo wala hana shughuli.',
        'Unganisha Google Calendar au Outlook kwenye Wasifu wako ili nyakati zako za shughuli ziheshimiwe na mikutano ionekane kwenye kalenda yako. Mialiko huja na faili ya kalenda.',
        'Ongeza kiungo cha video (Google Meet, Zoom, Teams) na watu wanaweza kujiunga kutoka Siku yangu.'],
      ['Dans Planning, choisissez Nouvelle réunion. OrbitOS propose des créneaux où chacun est dans ses heures de travail, ni en congé ni occupé.',
        'Connectez Google Agenda ou Outlook dans votre profil pour que vos indisponibilités soient respectées et que les réunions apparaissent dans votre agenda. Les invitations incluent un fichier calendrier.',
        'Ajoutez un lien vidéo (Google Meet, Zoom, Teams) et chacun peut rejoindre depuis Ma journée.']),
  },
  {
    id: 'expenses', icon: 'receipt', keywords: 'expense expenses approval approve reject two-person threshold payout mpesa finance spend',
    title: l('Expenses, approvals and M-Pesa payouts', 'Gharama, idhini na malipo ya M-Pesa', 'Dépenses, approbations et paiements M-Pesa'),
    body: p(
      ['Log spending under Operations → Finance & Runway. Above the amount set in Settings → Organization, an expense waits for approval.',
        'Two-person rule: nobody can approve their own expense. Owners and directors approve or reject in Approvals, or by swiping on a phone.',
        'Pay many people at once with M-Pesa payouts. Each payout is checked, sent, and its status updated automatically.'],
      ['Rekodi matumizi chini ya Operesheni → Fedha. Juu ya kiasi kilichowekwa katika Mipangilio → Shirika, gharama husubiri idhini.',
        'Kanuni ya watu wawili: hakuna anayeweza kuidhinisha gharama yake mwenyewe. Wamiliki na wakurugenzi huidhinisha au hukataa katika Idhini, au kwa kutelezesha kwenye simu.',
        'Lipa watu wengi kwa pamoja kwa malipo ya M-Pesa. Kila malipo hukaguliwa, hutumwa, na hali yake husasishwa yenyewe.'],
      ['Enregistrez les dépenses dans Opérations → Finances et trésorerie. Au-delà du montant défini dans Paramètres → Organisation, une dépense attend une approbation.',
        'Règle des deux personnes : personne ne peut approuver sa propre dépense. Propriétaires et directeurs approuvent ou refusent dans Approbations, ou par un glissement sur téléphone.',
        'Payez plusieurs personnes en une fois avec les paiements M-Pesa. Chaque paiement est vérifié, envoyé et son statut mis à jour automatiquement.']),
  },
  {
    id: 'invoices', icon: 'request_quote', keywords: 'invoice invoices client payment link mpesa card kra etims receipt reminder overdue paid',
    title: l('Invoices, payment links and KRA eTIMS', 'Ankara, viungo vya malipo na KRA eTIMS', 'Factures, liens de paiement et KRA eTIMS'),
    body: p(
      ['Create an invoice under Operations → Finance & Runway and choose Send. Your client gets an email with a link to pay by M-Pesa or card; it is marked paid automatically when they pay.',
        'Connect KRA eTIMS in Settings to fiscalise invoices; if KRA is slow, OrbitOS keeps trying every hour.',
        'Turn on Invoice reminders in Settings → Automations to email clients before and after the due date.'],
      ['Unda ankara chini ya Operesheni → Fedha na uchague Tuma. Mteja wako hupokea barua pepe yenye kiungo cha kulipa kwa M-Pesa au kadi; huwekwa kuwa imelipwa yenyewe wakilipa.',
        'Unganisha KRA eTIMS katika Mipangilio ili kusajili ankara; KRA ikichelewa, OrbitOS hujaribu tena kila saa.',
        'Washa Vikumbusho vya ankara katika Mipangilio → Mitambo ya kiotomatiki kuwatumia wateja barua pepe kabla na baada ya tarehe ya malipo.'],
      ['Créez une facture dans Opérations → Finances et trésorerie et choisissez Envoyer. Votre client reçoit un e-mail avec un lien pour payer par M-Pesa ou carte ; elle passe en payée automatiquement.',
        'Connectez KRA eTIMS dans Paramètres pour fiscaliser les factures ; si KRA est lent, OrbitOS réessaie chaque heure.',
        'Activez les relances de factures dans Paramètres → Automatisations pour écrire aux clients avant et après l’échéance.']),
  },
  {
    id: 'time-off', icon: 'beach_access', keywords: 'leave time off holiday vacation sick annual allowance approve cover handover away',
    title: l('Time off and handover', 'Likizo na makabidhiano', 'Congés et passation'),
    body: p(
      ['Request time off under People → Time off. Working days are counted for you; managers approve or decline with an optional message.',
        'Choose Handover to pick who covers while you’re away and move the tasks due during your leave to them in one step.',
        'Everyone sees who is away and who is covering, but not the type of leave or your note.'],
      ['Omba likizo chini ya Watu → Likizo. Siku za kazi huhesabiwa kwa ajili yako; mameneja huidhinisha au hukataa wakiweza kuongeza ujumbe.',
        'Chagua Makabidhiano kumchagua atakayeshughulikia kazi zako ukiwa haupo na kumhamishia kazi zinazotakiwa wakati wa likizo kwa hatua moja.',
        'Kila mtu huona aliye likizo na anayeshughulikia kazi zake, lakini si aina ya likizo wala ujumbe wako.'],
      ['Demandez un congé dans Équipe → Congés. Les jours ouvrés sont comptés pour vous ; les managers approuvent ou refusent avec un message facultatif.',
        'Choisissez Passation pour désigner votre remplaçant et lui transférer en une fois les tâches à échéance pendant votre absence.',
        'Tout le monde voit qui est absent et qui remplace, mais pas le type de congé ni votre note.']),
  },
  {
    id: 'automations', icon: 'bolt', keywords: 'automation automations reminder nudge overdue escalate onboarding checklist new member invoice reminder handover settings',
    title: l('Automations', 'Mitambo ya kiotomatiki', 'Automatisations'),
    body: p(
      ['Owners and directors choose automations in Settings → Automations: a first-week checklist for new members, invoice reminders to clients, overdue nudges with escalation to a manager, and time-off handover reminders.',
        'Messages go out on weekdays during working hours in each person’s time zone, and each one is sent only once. Recent activity is listed under the switches.'],
      ['Wamiliki na wakurugenzi huchagua mitambo katika Mipangilio → Mitambo ya kiotomatiki: orodha ya wiki ya kwanza kwa wanachama wapya, vikumbusho vya ankara kwa wateja, vikumbusho vya kazi zilizochelewa na kumjulisha meneja, na vikumbusho vya makabidhiano ya likizo.',
        'Ujumbe hutumwa siku za kazi wakati wa saa za kazi katika saa za kanda za kila mtu, na kila mmoja hutumwa mara moja tu. Shughuli za hivi karibuni huonekana chini ya swichi.'],
      ['Propriétaires et directeurs choisissent les automatisations dans Paramètres → Automatisations : checklist de première semaine, relances de factures, rappels de retard avec alerte au manager, rappels de passation avant les congés.',
        'Les messages partent en semaine pendant les heures de travail de chacun, une seule fois chacun. L’activité récente s’affiche sous les interrupteurs.']),
  },
  {
    id: 'notifications', icon: 'notifications', keywords: 'notification notifications phone push alerts bell email whatsapp turn off quiet hours',
    title: l('Notifications on your phone', 'Arifa kwenye simu yako', 'Notifications sur votre téléphone'),
    body: p(
      ['Everything important lands in the bell at the top. To get it on your phone or computer, open Profile → Phone and desktop notifications and switch it on for this device.',
        'On iPhone, first add OrbitOS to your Home Screen (Share → Add to Home Screen), then switch notifications on from there.',
        'You can turn off tips and follow-up emails in your Profile; emails about payments are always sent.'],
      ['Kila kitu muhimu huingia kwenye kengele juu. Kuzipata kwenye simu au kompyuta, fungua Wasifu → Arifa za simu na kompyuta na uziwashe kwa kifaa hiki.',
        'Kwenye iPhone, kwanza ongeza OrbitOS kwenye Skrini ya Nyumbani (Shiriki → Ongeza kwenye Skrini ya Nyumbani), kisha washa arifa kutoka hapo.',
        'Unaweza kuzima vidokezo na barua pepe za ufuatiliaji kwenye Wasifu wako; barua pepe kuhusu malipo hutumwa kila wakati.'],
      ['Tout ce qui compte arrive dans la cloche en haut. Pour le recevoir sur téléphone ou ordinateur, ouvrez Profil → Notifications sur téléphone et ordinateur et activez-les pour cet appareil.',
        'Sur iPhone, ajoutez d’abord OrbitOS à l’écran d’accueil (Partager → Sur l’écran d’accueil), puis activez les notifications depuis là.',
        'Vous pouvez désactiver les conseils et e-mails de suivi dans votre profil ; les e-mails liés aux paiements sont toujours envoyés.']),
  },
  {
    id: 'billing', icon: 'credit_card', keywords: 'billing plan price pay payment mpesa card renew trial expired read-only receipt seats upgrade cost kes',
    title: l('Plans, payment and renewal', 'Mipango, malipo na kuhuisha', 'Formules, paiement et renouvellement'),
    body: p(
      ['Every workspace starts with a 14-day free trial. Owners choose a plan under Settings → Billing and pay by M-Pesa (an STK prompt on your phone) or card, monthly or yearly. Plans start from KES 4,900 a month.',
        'Payments don’t renew automatically: you get reminders 7 and 3 days before and on the day. If the plan runs out, the workspace becomes read-only — nothing is deleted — until you renew.',
        'Receipts with your KRA PIN are available under Billing.'],
      ['Kila eneo la kazi huanza na majaribio ya bure ya siku 14. Wamiliki huchagua mpango chini ya Mipangilio → Malipo na kulipa kwa M-Pesa (ombi la STK kwenye simu yako) au kadi, kila mwezi au kila mwaka. Mipango huanzia KES 4,900 kwa mwezi.',
        'Malipo hayajihuishi yenyewe: unapata vikumbusho siku 7 na 3 kabla na siku yenyewe. Mpango ukiisha, eneo la kazi huwa la kusoma tu — hakuna kinachofutwa — hadi uhuishe.',
        'Risiti zenye PIN yako ya KRA zinapatikana chini ya Malipo.'],
      ['Chaque espace commence par un essai gratuit de 14 jours. Les propriétaires choisissent une formule dans Paramètres → Facturation et paient par M-Pesa (demande STK sur le téléphone) ou carte, au mois ou à l’année. À partir de 4 900 KES par mois.',
        'Le paiement ne se renouvelle pas automatiquement : rappels 7 et 3 jours avant puis le jour même. Si la formule expire, l’espace passe en lecture seule — rien n’est supprimé — jusqu’au renouvellement.',
        'Les reçus avec votre PIN KRA sont disponibles dans Facturation.']),
  },
  {
    id: 'security', icon: 'shield_lock', keywords: 'security two-factor 2fa passkey password sign in login authenticator audit log data private vault',
    title: l('Security and signing in', 'Usalama na kuingia', 'Sécurité et connexion'),
    body: p(
      ['Turn on two-factor sign-in in your Profile with an authenticator app (Google Authenticator, Authy, 1Password), or add a passkey to sign in with your fingerprint or face.',
        'Owners can require two-factor for all managers in Settings → Authentication & identity. Every company’s data is kept separate, and every important action is recorded in the audit log.',
        'Forgot your password? Choose Forgot password on the sign-in page.'],
      ['Washa uthibitishaji wa hatua mbili kwenye Wasifu wako kwa programu ya uthibitishaji (Google Authenticator, Authy, 1Password), au ongeza passkey kuingia kwa alama ya kidole au uso.',
        'Wamiliki wanaweza kulazimisha hatua mbili kwa mameneja wote katika Mipangilio → Uthibitishaji na utambulisho. Data ya kila kampuni huwekwa kando, na kila kitendo muhimu hurekodiwa kwenye kumbukumbu ya ukaguzi.',
        'Umesahau nenosiri? Chagua Umesahau nenosiri kwenye ukurasa wa kuingia.'],
      ['Activez la double authentification dans votre profil avec une application (Google Authenticator, Authy, 1Password), ou ajoutez une clé d’accès pour vous connecter par empreinte ou visage.',
        'Les propriétaires peuvent l’imposer à tous les managers dans Paramètres → Authentification et identité. Les données de chaque entreprise sont séparées et chaque action importante est consignée dans le journal d’audit.',
        'Mot de passe oublié ? Choisissez Mot de passe oublié sur la page de connexion.']),
  },
  {
    id: 'personalise', icon: 'palette', keywords: 'language kiswahili french english theme dark light branding logo colour color time zone working hours profile',
    title: l('Language, time zone and branding', 'Lugha, saa za kanda na utambulisho', 'Langue, fuseau horaire et identité visuelle'),
    body: p(
      ['Choose English, Kiswahili or French, light or dark theme, your time zone and working hours in your Profile.',
        'Owners add the company logo and accent colour under Settings → Branding; shades are adjusted automatically so text stays readable.',
        'Replay the product tour any time: press Ctrl+K and choose Take the tour.'],
      ['Chagua Kiingereza, Kiswahili au Kifaransa, mandhari ya mwanga au giza, saa zako za kanda na saa za kazi kwenye Wasifu wako.',
        'Wamiliki huongeza nembo ya kampuni na rangi kuu chini ya Mipangilio → Utambulisho; vivuli hurekebishwa vyenyewe ili maandishi yasomeke.',
        'Rudia ziara ya bidhaa wakati wowote: bonyeza Ctrl+K na uchague Fanya ziara.'],
      ['Choisissez l’anglais, le kiswahili ou le français, le thème clair ou sombre, votre fuseau horaire et vos heures de travail dans votre profil.',
        'Les propriétaires ajoutent le logo et la couleur dans Paramètres → Identité visuelle ; les nuances sont ajustées pour rester lisibles.',
        'Relancez la visite à tout moment : Ctrl+K puis Faire la visite.']),
  },
];

/** Simple keyword search (works without AI): best matches first. Keywords and titles count most. */
const norm = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, '');
export function searchArticles(query: string, lang: Language, limit = 4): Article[] {
  const STOP = new Set(['how', 'the', 'and', 'for', 'with', 'what', 'can', 'does', 'jinsi', 'gani', 'nini', 'comment', 'pour', 'avec', 'une', 'des', 'les']);
  const words = norm(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return [];
  const scored = ARTICLES.map((a) => {
    const tokens = (x: string) => norm(x).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const keys = tokens(a.keywords);
    const title = tokens(`${a.title[lang]} ${a.title.en}`);
    const body = norm(a.body[lang].join(' '));
    // Whole words count most; a word that starts another ("renew" → "renewal") counts a little, if it's long enough.
    const hit = (list: string[], w: string, whole: number, part: number) => (list.includes(w) ? whole : w.length >= 4 && list.some((k) => k.startsWith(w)) ? part : 0);
    let score = 0;
    for (const w of words) score += hit(keys, w, 4, 2) + hit(title, w, 3, 1) + (body.includes(w) ? 1 : 0);
    return { a, score };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((x) => x.a);
}
