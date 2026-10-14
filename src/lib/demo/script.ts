// Guided demo: what the voice says on each screen, in English, Kiswahili and French.
// Keep lines short (one or two sentences): they are spoken one at a time and shown as captions.
// Only describe what is really on the screen. Kiswahili/French are machine-assisted drafts.
import type { Language } from '@/i18n/shared';
import type { Role } from '@/lib/types';
import { can } from '@/lib/roles';

export type Access = 'all' | 'write' | 'manage' | 'finance' | 'audit' | 'owner';
export interface DemoLine { text: Record<Language, string>; target?: string; founderOnly?: boolean }
export interface DemoScreen { id: string; href?: string; title: Record<Language, string>; lines: DemoLine[]; access?: Access; tour?: boolean }
const l = (en: string, sw: string, fr: string, target?: string, founderOnly = false): DemoLine => ({ text: { en, sw, fr }, target, founderOnly });
const t = (en: string, sw: string, fr: string): Record<Language, string> => ({ en, sw, fr });

/** In tour order. `tour: false` screens (one task, one meeting…) are explained when someone opens them. */
export const DEMO: DemoScreen[] = [
  {
    id: 'dashboard', href: '/dashboard', tour: true, title: t('Dashboard', 'Dashibodi', 'Tableau de bord'),
    lines: [
      l('Welcome to OrbitOS, the operating system for remote and hybrid teams in Africa.', 'Karibu OrbitOS, mfumo wa uendeshaji kwa timu za mbali na mseto barani Afrika.', 'Bienvenue sur OrbitOS, le système d’exploitation des équipes à distance et hybrides en Afrique.'),
      l('Instead of juggling tasks, meetings, spreadsheets, WhatsApp approvals and invoices in five tools, everything lives here, priced in shillings.', 'Badala ya kutumia zana tano kwa kazi, mikutano, majedwali, idhini za WhatsApp na ankara, kila kitu kiko hapa, kwa bei ya shilingi.', 'Au lieu de jongler entre cinq outils pour les tâches, réunions, tableurs, approbations WhatsApp et factures, tout est ici, avec des prix en shillings.'),
      l('The dashboard is the big picture. The Company Health Index combines delivery, runway, culture and compliance into one score.', 'Dashibodi ni picha kubwa. Kiashiria cha Afya ya Kampuni kinaunganisha utekelezaji, akiba ya fedha, utamaduni na utiifu kuwa alama moja.', 'Le tableau de bord donne la vue d’ensemble. L’indice de santé combine livraison, trésorerie, culture et conformité en un seul score.'),
      l('Urgent actions show what needs a decision today, and the overlap window shows when the team is online together across time zones.', 'Hatua za dharura zinaonyesha kinachohitaji uamuzi leo, na muda wa pamoja unaonyesha timu iko mtandaoni pamoja lini katika saa za kanda tofauti.', 'Les actions urgentes montrent ce qui demande une décision aujourd’hui, et la plage commune indique quand l’équipe est en ligne ensemble malgré les fuseaux.'),
      l('Every Monday, an AI chief of staff writes a short brief of wins, risks and blockers from the team’s own check-ins.', 'Kila Jumatatu, mkuu wa wafanyakazi wa AI huandika muhtasari mfupi wa mafanikio, hatari na vizuizi kutoka ripoti za timu yenyewe.', 'Chaque lundi, un chef de cabinet IA rédige un court brief des réussites, risques et blocages tirés des points de l’équipe.'),
    ],
  },
  {
    id: 'my-day', href: '/my-day', tour: true, title: t('My day', 'Siku yangu', 'Ma journée'),
    lines: [
      l('My day is your own starting point: your tasks, today’s meetings, your check-in, approvals waiting, mentions and who’s away.', 'Siku yangu ni mahali pako pa kuanzia: kazi zako, mikutano ya leo, ripoti yako, idhini zinazosubiri, ulipotajwa na nani yuko likizo.', 'Ma journée est votre point de départ : vos tâches, les réunions du jour, votre point, les approbations en attente, les mentions et les absents.'),
      l('Tick the circle to finish a task. On a phone, just swipe it to the right, with an undo if you change your mind.', 'Bofya duara kumaliza kazi. Kwenye simu, telezesha kulia tu, na unaweza kutendua ukibadilisha nia.', 'Cochez le cercle pour terminer une tâche. Sur téléphone, balayez-la vers la droite, avec possibilité d’annuler.', '[data-task-row]'),
    ],
  },
  {
    id: 'operations', href: '/operations', tour: true, title: t('Projects & Sprints', 'Miradi na Sprint', 'Projets et sprints'),
    lines: [
      l('Operations is where the work lives: sprints, and a board you drag tasks across as they move.', 'Operesheni ndipo kazi ilipo: sprint, na ubao unaoburuta kazi zinaposonga.', 'Opérations, c’est là que vit le travail : des sprints et un tableau où l’on déplace les tâches.'),
      l('New task creates one, or press N anywhere. Use a template creates a ready-made list, like employee onboarding, month-end close or KRA monthly returns, with dates.', 'Kazi mpya huunda moja, au bonyeza N popote. Tumia kiolezo huunda orodha tayari, kama kumkaribisha mfanyakazi, kufunga mwezi au ritani za KRA, pamoja na tarehe.', 'Nouvelle tâche en crée une, ou appuyez sur N partout. Utiliser un modèle crée une liste prête — intégration, clôture mensuelle, déclarations KRA — avec ses dates.'),
      l('You can import tasks from Excel or a pasted spreadsheet. Open any task to see comments and mentions.', 'Unaweza kuleta kazi kutoka Excel au jedwali lililobandikwa. Fungua kazi yoyote kuona maoni na kutajwa.', 'Vous pouvez importer des tâches depuis Excel ou un tableur collé. Ouvrez une tâche pour voir commentaires et mentions.'),
    ],
  },
  {
    id: 'task', tour: false, title: t('A task', 'Kazi', 'Une tâche'),
    lines: [
      l('Each task has an owner, a due date, a priority and story points, and belongs to a sprint or the backlog.', 'Kila kazi ina mhusika, tarehe ya mwisho, kipaumbele na pointi, na iko kwenye sprint au orodha ya kusubiri.', 'Chaque tâche a un responsable, une échéance, une priorité et des points, dans un sprint ou le backlog.'),
      l('Discuss it right here: type @ to mention a teammate, and they’re notified. Deleted something by mistake? Undo brings it back for ten minutes.', 'Jadilini hapa hapa: andika @ kumtaja mwenzako, naye ataarifiwa. Umefuta kitu kimakosa? Tendua hukirudisha kwa dakika kumi.', 'Discutez ici même : tapez @ pour mentionner un collègue, il est prévenu. Supprimé par erreur ? Annuler le restaure pendant dix minutes.'),
    ],
  },
  {
    id: 'activity', href: '/operations?tab=activity', tour: true, title: t('Team Activity', 'Shughuli za timu', 'Activité de l’équipe'),
    lines: [
      l('Team Activity is a live stream of what’s happening: tasks completed, check-ins, kudos, approvals, and code merged on GitHub.', 'Shughuli za timu ni mtiririko wa moja kwa moja wa kinachoendelea: kazi zilizokamilika, ripoti, pongezi, idhini, na msimbo uliounganishwa GitHub.', 'L’activité de l’équipe est un flux en direct : tâches terminées, points, bravos, approbations et code fusionné sur GitHub.'),
    ],
  },
  {
    id: 'finance', href: '/operations?tab=finance', tour: true, access: 'finance', title: t('Finance & Runway', 'Fedha', 'Finances et trésorerie'),
    lines: [
      l('Finance shows cash, burn and runway. Expenses above a limit need approval, and nobody can approve their own.', 'Fedha inaonyesha pesa taslimu, matumizi na akiba ya muda. Gharama zinazozidi kikomo zinahitaji idhini, na hakuna anayeidhinisha yake mwenyewe.', 'Les finances montrent trésorerie, consommation et autonomie. Au-delà d’un seuil, une dépense doit être approuvée, et personne n’approuve la sienne.', '#approvals'),
      l('On a phone, managers swipe right to approve and left to decline.', 'Kwenye simu, mameneja hutelezesha kulia kuidhinisha na kushoto kukataa.', 'Sur téléphone, les managers balaient à droite pour approuver, à gauche pour refuser.'),
      l('Invoices go out with an M-Pesa or card payment link, are marked paid automatically, and are fiscalised with KRA eTIMS.', 'Ankara hutumwa na kiungo cha malipo cha M-Pesa au kadi, huwekwa kuwa zimelipwa zenyewe, na husajiliwa na KRA eTIMS.', 'Les factures partent avec un lien de paiement M-Pesa ou carte, passent en payées automatiquement et sont fiscalisées avec KRA eTIMS.'),
      l('You can also pay many people at once with M-Pesa payouts, and record payroll runs.', 'Unaweza pia kulipa watu wengi kwa pamoja kwa malipo ya M-Pesa, na kurekodi malipo ya mishahara.', 'Vous pouvez aussi payer plusieurs personnes en une fois par M-Pesa et enregistrer les paies.'),
    ],
  },
  {
    id: 'invoice', tour: false, access: 'finance', title: t('An invoice', 'Ankara', 'Une facture'),
    lines: [
      l('An invoice shows who it’s for, the amount, the due date and its payment link. When the client pays by M-Pesa or card, it’s marked paid by itself.', 'Ankara inaonyesha ni ya nani, kiasi, tarehe ya mwisho na kiungo chake cha malipo. Mteja akilipa kwa M-Pesa au kadi, huwekwa kuwa imelipwa yenyewe.', 'Une facture indique le client, le montant, l’échéance et son lien de paiement. Quand le client paie par M-Pesa ou carte, elle passe en payée toute seule.'),
      l('With KRA eTIMS connected, the KRA receipt number and QR code appear here, and you can download the PDF.', 'Ukiwa umeunganisha KRA eTIMS, nambari ya risiti ya KRA na msimbo wa QR huonekana hapa, na unaweza kupakua PDF.', 'Avec KRA eTIMS connecté, le numéro de reçu KRA et le QR code apparaissent ici, et vous pouvez télécharger le PDF.', '#etims-panel'),
    ],
  },
  {
    id: 'scheduling', href: '/scheduling', tour: true, title: t('Scheduling', 'Ratiba', 'Planning'),
    lines: [
      l('Scheduling finds meeting times inside everyone’s working hours, skips people on leave, and syncs with Google Calendar and Outlook.', 'Ratiba hupata nyakati za mikutano ndani ya saa za kazi za kila mtu, huwaruka walio likizo, na huungana na Google Calendar na Outlook.', 'Le planning trouve des créneaux dans les heures de travail de chacun, écarte les absents et se synchronise avec Google Agenda et Outlook.'),
      l('Not everything needs a call: async-first meetings let people record an update instead of joining live.', 'Si kila jambo linahitaji simu: mikutano ya kurekodi huwaruhusu watu kurekodi taarifa badala ya kujiunga moja kwa moja.', 'Tout ne mérite pas un appel : les réunions asynchrones permettent d’enregistrer une mise à jour au lieu de se connecter en direct.'),
    ],
  },
  {
    id: 'meeting', tour: false, title: t('A meeting', 'Mkutano', 'Une réunion'),
    lines: [
      l('A meeting shows the time in your own time zone, who’s invited, and anyone outside their working hours.', 'Mkutano unaonyesha muda kwa saa zako za kanda, walioalikwa, na yeyote aliye nje ya saa zake za kazi.', 'Une réunion affiche l’heure dans votre fuseau, les invités et ceux qui seraient hors de leurs heures de travail.'),
      l('Join the video call from here, or add it to Google Calendar or any calendar with the .ics file.', 'Jiunge na simu ya video kutoka hapa, au uiongeze kwenye Google Calendar au kalenda yoyote kwa faili ya .ics.', 'Rejoignez l’appel vidéo d’ici, ou ajoutez-la à Google Agenda ou à n’importe quel agenda avec le fichier .ics.'),
    ],
  },
  {
    id: 'culture', href: '/culture', tour: true, title: t('Culture', 'Utamaduni', 'Culture'),
    lines: [
      l('Culture keeps a remote team connected. The daily check-in asks what you did, what’s next and what’s blocking you, and people can answer straight from WhatsApp.', 'Utamaduni huiweka timu ya mbali pamoja. Ripoti ya kila siku huuliza ulichofanya, kinachofuata na kinachokuzuia, na watu wanaweza kujibu moja kwa moja kutoka WhatsApp.', 'La culture garde l’équipe soudée. Le point quotidien demande ce que vous avez fait, la suite et ce qui bloque, et l’on peut répondre directement depuis WhatsApp.', '#roll-call'),
      l('There’s a weekly culture pulse, announcements, kudos to celebrate good work, and channels for team chat.', 'Kuna kura ya mapigo ya utamaduni ya kila wiki, matangazo, pongezi kusherehekea kazi nzuri, na chaneli za mazungumzo ya timu.', 'Il y a un baromètre hebdomadaire, des annonces, des bravos pour célébrer le bon travail et des canaux pour discuter.'),
    ],
  },
  {
    id: 'channel', tour: false, title: t('A channel', 'Chaneli', 'Un canal'),
    lines: [
      l('Channels are team chat inside OrbitOS, so conversations stay with your work instead of scattered across WhatsApp groups.', 'Chaneli ni mazungumzo ya timu ndani ya OrbitOS, ili mazungumzo yabaki na kazi yenu badala ya kutawanyika kwenye vikundi vya WhatsApp.', 'Les canaux sont la messagerie d’équipe dans OrbitOS : les échanges restent avec le travail, pas éparpillés dans des groupes WhatsApp.'),
    ],
  },
  {
    id: 'compliance', href: '/compliance', tour: true, title: t('Compliance', 'Utiifu', 'Conformité'),
    lines: [
      l('Compliance tracks frameworks like SOC 2, ISO 27001, GDPR and HIPAA, control by control, with evidence and a readiness score.', 'Utiifu hufuatilia mifumo kama SOC 2, ISO 27001, GDPR na HIPAA, udhibiti mmoja baada ya mwingine, pamoja na ushahidi na alama ya utayari.', 'La conformité suit des référentiels comme SOC 2, ISO 27001, RGPD et HIPAA, contrôle par contrôle, avec preuves et score de préparation.'),
      l('It also runs security awareness training, tracks company laptops, handles data requests within the 30-day deadline, and keeps a security log.', 'Pia huendesha mafunzo ya uelewa wa usalama, hufuatilia kompyuta za kampuni, hushughulikia maombi ya data ndani ya siku 30, na huweka kumbukumbu ya usalama.', 'Elle gère aussi la formation à la sécurité, le parc d’ordinateurs, les demandes d’accès aux données sous 30 jours et un journal de sécurité.'),
      l('Sensitive contracts and IP go in the vault, which needs two-factor sign-in to open. One click downloads an audit-ready package.', 'Mikataba nyeti na mali ya kiakili huwekwa kwenye hifadhi, inayohitaji uthibitishaji wa hatua mbili kufunguliwa. Mbofyo mmoja hupakua kifurushi tayari kwa ukaguzi.', 'Contrats sensibles et propriété intellectuelle vont dans le coffre, qui exige la double authentification. Un clic télécharge un dossier prêt pour l’audit.'),
    ],
  },
  {
    id: 'framework', tour: false, title: t('A framework', 'Mfumo', 'Un référentiel'),
    lines: [
      l('Each framework lists its controls, who owns them and whether they pass. Attach evidence to a control and the readiness score updates.', 'Kila mfumo huorodhesha udhibiti wake, wahusika na kama unapita. Ambatisha ushahidi kwenye udhibiti na alama ya utayari husasishwa.', 'Chaque référentiel liste ses contrôles, leurs responsables et leur statut. Joignez une preuve à un contrôle et le score se met à jour.'),
    ],
  },
  {
    id: 'reports', href: '/reports', tour: true, title: t('Reports', 'Ripoti', 'Rapports'),
    lines: [
      l('Reports turn it all into numbers for the board: delivery, people, finance and compliance, with burnout risk and eNPS.', 'Ripoti hugeuza yote kuwa takwimu kwa bodi: utekelezaji, watu, fedha na utiifu, pamoja na hatari ya uchovu na eNPS.', 'Les rapports transforment tout en chiffres pour le conseil : livraison, équipe, finances et conformité, avec risque d’épuisement et eNPS.'),
      l('Export a full PDF or CSV, post the summary to Slack, or schedule digests by email. Insights even suggest meetings to move.', 'Hamisha PDF au CSV kamili, tuma muhtasari Slack, au panga muhtasari kwa barua pepe. Maarifa hupendekeza hata mikutano ya kuhamisha.', 'Exportez un PDF ou un CSV complet, publiez le résumé sur Slack ou planifiez des envois par e-mail. Les suggestions proposent même des réunions à déplacer.'),
    ],
  },
  {
    id: 'people', href: '/people', tour: true, title: t('People', 'Watu', 'Équipe'),
    lines: [
      l('People is the team directory, with everyone’s role and their local time, which updates live.', 'Watu ni orodha ya timu, pamoja na wadhifa wa kila mtu na saa zake za eneo, zinazosasishwa moja kwa moja.', 'Équipe est l’annuaire, avec le rôle de chacun et son heure locale, mise à jour en direct.'),
      l('Managers invite people by email or link, or import a whole team from Excel. New members get a first-week checklist automatically.', 'Mameneja huwaalika watu kwa barua pepe au kiungo, au huleta timu nzima kutoka Excel. Wanachama wapya hupata orodha ya wiki ya kwanza yenyewe.', 'Les managers invitent par e-mail ou lien, ou importent toute l’équipe depuis Excel. Les nouveaux reçoivent automatiquement une checklist de première semaine.'),
    ],
  },
  {
    id: 'leave', href: '/people?tab=leave', tour: true, title: t('Time off', 'Likizo', 'Congés'),
    lines: [
      l('Time off: request leave, managers approve, and working days are counted for you against your yearly allowance.', 'Likizo: omba likizo, mameneja huidhinisha, na siku za kazi huhesabiwa dhidi ya posho yako ya mwaka.', 'Congés : on demande, le manager approuve, et les jours ouvrés sont décomptés de votre solde annuel.'),
      l('Before you go, Handover picks who covers and moves the tasks due while you’re away, in one step. Everyone sees who’s covering, but not your reason.', 'Kabla hujaondoka, Makabidhiano humchagua atakayeshughulikia kazi zako na kumhamishia kazi zinazotakiwa ukiwa haupo, kwa hatua moja. Kila mtu huona anayeshughulikia, lakini si sababu yako.', 'Avant de partir, la passation désigne un remplaçant et lui transfère vos tâches en une fois. Tout le monde voit qui remplace, pas votre motif.'),
    ],
  },
  {
    id: 'notifications', href: '/notifications', tour: true, title: t('Notifications', 'Arifa', 'Notifications'),
    lines: [
      l('Everything that needs you lands here: mentions, approvals, reminders and handovers, in your own language. Switch on phone notifications to get them on the go.', 'Kila kinachokuhitaji huingia hapa: kutajwa, idhini, vikumbusho na makabidhiano, kwa lugha yako. Washa arifa za simu uzipate popote.', 'Tout ce qui vous concerne arrive ici : mentions, approbations, rappels et passations, dans votre langue. Activez les notifications téléphone pour les recevoir partout.'),
    ],
  },
  {
    id: 'profile', href: '/profile', tour: true, title: t('Profile', 'Wasifu', 'Profil'),
    lines: [
      l('Your profile is where you choose English, Kiswahili or French, light or dark theme, your time zone, working hours and number format.', 'Wasifu wako ndipo unapochagua Kiingereza, Kiswahili au Kifaransa, mandhari ya mwanga au giza, saa za kanda, saa za kazi na muundo wa nambari.', 'Votre profil permet de choisir anglais, kiswahili ou français, thème clair ou sombre, fuseau horaire, heures de travail et format des nombres.'),
      l('Link WhatsApp, connect your calendar, switch on phone notifications, and protect your account with two-factor sign-in or a passkey.', 'Unganisha WhatsApp, unganisha kalenda yako, washa arifa za simu, na linda akaunti yako kwa uthibitishaji wa hatua mbili au passkey.', 'Associez WhatsApp, connectez votre agenda, activez les notifications téléphone et protégez votre compte avec la double authentification ou une clé d’accès.', '#security'),
      l('Data saver keeps OrbitOS light on slow or expensive connections.', 'Kiokoa data huiweka OrbitOS nyepesi kwenye mtandao wa polepole au ghali.', 'L’économiseur de données garde OrbitOS léger sur les connexions lentes ou coûteuses.', '#data'),
    ],
  },
  {
    id: 'settings', href: '/settings', tour: true, title: t('Settings', 'Mipangilio', 'Paramètres'),
    lines: [
      l('Settings is where the workspace is run: company details, currency, and the amount above which expenses need approval.', 'Mipangilio ndipo eneo la kazi linapoendeshwa: maelezo ya kampuni, sarafu, na kiasi ambacho gharama zinazozidi zinahitaji idhini.', 'Les paramètres pilotent l’espace : informations de l’entreprise, devise et montant au-delà duquel une dépense doit être approuvée.', '#organization'),
      l('Automations do the chasing: a first-week checklist for new hires, reminders for late tasks, invoice reminders to clients and handover before time off.', 'Mitambo ya kiotomatiki hufuatilia: orodha ya wiki ya kwanza kwa wafanyakazi wapya, vikumbusho vya kazi zilizochelewa, vikumbusho vya ankara kwa wateja na makabidhiano kabla ya likizo.', 'Les automatisations relancent pour vous : checklist des recrues, rappels de retard, relances de factures et passation avant les congés.', '#automations'),
      l('Branding adds your logo and colour, and keeps text readable automatically.', 'Utambulisho huongeza nembo na rangi yako, na huhakikisha maandishi yanasomeka yenyewe.', 'L’identité visuelle ajoute votre logo et votre couleur, en gardant le texte lisible automatiquement.', '#branding'),
      l('Under authentication, owners can require two-factor sign-in for managers, set session time-outs and connect single sign-on.', 'Chini ya uthibitishaji, wamiliki wanaweza kulazimisha hatua mbili kwa mameneja, kuweka muda wa kikao na kuunganisha kuingia mara moja.', 'Côté authentification, les propriétaires peuvent imposer la double authentification aux managers, régler l’expiration des sessions et connecter l’authentification unique.', '#auth'),
      l('Time zone settings set the team’s core hours and quiet hours, so nobody is pinged at night.', 'Mipangilio ya saa za kanda huweka saa kuu za timu na saa za utulivu, ili hakuna anayesumbuliwa usiku.', 'Les paramètres de fuseau fixent les heures communes et les heures calmes, pour que personne ne soit dérangé la nuit.', '#timezone'),
      l('Integrations connect Slack, GitHub and more, and KRA eTIMS connects here for fiscal receipts.', 'Miunganisho huunganisha Slack, GitHub na zaidi, na KRA eTIMS huunganishwa hapa kwa risiti za kodi.', 'Les intégrations connectent Slack, GitHub et plus, et KRA eTIMS se connecte ici pour les reçus fiscaux.', '#integrations'),
      l('Data governance covers where data lives, how long it’s kept, and a full export whenever you want it.', 'Usimamizi wa data unahusu data inapohifadhiwa, inakaa muda gani, na uhamishaji kamili wakati wowote.', 'La gouvernance des données couvre l’hébergement, la durée de conservation et un export complet à tout moment.', '#data'),
      l('And members and roles decide who sees what: owners, directors, contributors and read-only auditors.', 'Na wanachama na majukumu huamua nani anaona nini: wamiliki, wakurugenzi, wachangiaji na wakaguzi wa kusoma tu.', 'Enfin, membres et rôles décident qui voit quoi : propriétaires, directeurs, contributeurs et auditeurs en lecture seule.', '#members'),
    ],
  },
  {
    id: 'billing', href: '/settings/billing', tour: true, access: 'owner', title: t('Billing', 'Malipo', 'Facturation'),
    lines: [
      l('Billing shows your plan, seats and renewal date. Pay by M-Pesa, which sends a prompt to your phone, or by card, monthly or yearly.', 'Malipo huonyesha mpango wako, nafasi na tarehe ya kuhuisha. Lipa kwa M-Pesa, inayotuma ombi kwenye simu yako, au kwa kadi, kila mwezi au kila mwaka.', 'La facturation affiche votre formule, vos sièges et la date de renouvellement. Payez par M-Pesa, qui envoie une demande sur votre téléphone, ou par carte, au mois ou à l’année.'),
      l('Every payment has a receipt, with your KRA PIN on it so you can claim the VAT.', 'Kila malipo yana risiti, yenye PIN yako ya KRA ili udai VAT.', 'Chaque paiement a son reçu, avec votre PIN KRA pour récupérer la TVA.'),
    ],
  },
  {
    id: 'audit', href: '/settings/audit-log', tour: true, access: 'audit', title: t('Audit log', 'Kumbukumbu ya ukaguzi', 'Journal d’audit'),
    lines: [
      l('The audit log records every important action, who did it and when. It can’t be edited, and you can export it as CSV for auditors.', 'Kumbukumbu ya ukaguzi hurekodi kila kitendo muhimu, aliyekifanya na lini. Haiwezi kuhaririwa, na unaweza kuihamisha kama CSV kwa wakaguzi.', 'Le journal d’audit enregistre chaque action importante, qui l’a faite et quand. Il n’est pas modifiable et s’exporte en CSV pour les auditeurs.'),
    ],
  },
  {
    id: 'help', href: '/help', tour: true, title: t('Help centre', 'Kituo cha msaada', 'Centre d’aide'),
    lines: [
      l('And if you ever get stuck, the help centre answers your questions in English, Kiswahili or French, from our own guides.', 'Na ukikwama wakati wowote, kituo cha msaada hujibu maswali yako kwa Kiingereza, Kiswahili au Kifaransa, kutoka kwa miongozo yetu.', 'Et si vous bloquez, le centre d’aide répond à vos questions en anglais, kiswahili ou français, à partir de nos guides.'),
      l('That’s OrbitOS. You can replay this guided demo any time from search.', 'Hiyo ndiyo OrbitOS. Unaweza kurudia maonyesho haya wakati wowote kutoka kwenye utafutaji.', 'Voilà OrbitOS. Vous pouvez relancer cette démo guidée à tout moment depuis la recherche.'),
      l('OrbitOS starts from 4,900 shillings a month, with a 14-day free trial, paid by M-Pesa or card. Try it today, the link is in the comments.', 'OrbitOS huanzia shilingi 4,900 kwa mwezi, na majaribio ya bure ya siku 14, kulipa kwa M-Pesa au kadi. Ijaribu leo, kiungo kiko kwenye maoni.', 'OrbitOS commence à 4 900 shillings par mois, avec 14 jours d’essai gratuit, payable par M-Pesa ou carte. Essayez dès aujourd’hui, le lien est en commentaire.', undefined, true),
    ],
  },
];

export function allowed(screen: DemoScreen, role: Role): boolean {
  switch (screen.access ?? 'all') {
    case 'write': return can.write(role);
    case 'manage': return can.manage(role);
    case 'finance': return can.seeFinance(role);
    case 'audit': return can.seeAudit(role);
    case 'owner': return can.owner(role);
    default: return true;
  }
}

/** The lines this person hears: the founder's sales line only plays for founders. */
export const linesFor = (screen: DemoScreen, founder: boolean) => screen.lines.filter((x) => founder || !x.founderOnly);

/** The tour chapters this person can open, in order. */
export const chaptersFor = (role: Role) => DEMO.filter((s) => s.tour && s.href && allowed(s, role));

/** The next chapter after this screen that the person can open (detail pages continue from their list page). */
export function nextFor(screenId: string, role: Role): DemoScreen | undefined {
  const parent: Record<string, string> = { task: 'operations', invoice: 'finance', meeting: 'scheduling', channel: 'culture', framework: 'compliance' };
  const chapters = chaptersFor(role);
  const i = chapters.findIndex((s) => s.id === (parent[screenId] ?? screenId));
  return i >= 0 ? chapters[i + 1] : chapters[0];
}

/** The demo screen for a URL (the tab in the query string matters). */
export function screenFor(pathname: string, search: string): DemoScreen | undefined {
  const tab = new URLSearchParams(search).get('tab');
  const by = (id: string) => DEMO.find((s) => s.id === id);
  if (pathname === '/operations') return by(tab === 'finance' ? 'finance' : tab === 'activity' ? 'activity' : 'operations');
  if (pathname === '/people') return by(tab === 'leave' ? 'leave' : 'people');
  if (/^\/operations\/tasks\/[^/]+$/.test(pathname)) return by('task');
  if (/^\/operations\/invoices\/[^/]+$/.test(pathname)) return by('invoice');
  if (/^\/scheduling\/meetings\/[^/]+$/.test(pathname)) return by('meeting');
  if (/^\/compliance\/frameworks\/[^/]+$/.test(pathname)) return by('framework');
  if (/^\/culture\/channels\/[^/]+$/.test(pathname)) return by('channel');
  return DEMO.find((s) => s.href === pathname);
}
