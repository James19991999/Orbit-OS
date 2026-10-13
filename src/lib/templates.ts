// Ready-made task lists. Each task's due date is "start date + offset" (negative = before the start date).
// Titles are written in the language of the person applying the template.
import type { Language } from '@/i18n/shared';

type L = Record<Language, string>;
export interface TemplateTask { title: L; offset: number; priority: 'low' | 'medium' | 'high' | 'critical'; points: number; tags: string[] }
export interface Template { id: string; icon: string; name: L; description: L; tasks: TemplateTask[] }

const t = (en: string, sw: string, fr: string): L => ({ en, sw, fr });

export const TEMPLATES: Template[] = [
  {
    id: 'onboarding', icon: 'person_add',
    name: t('Employee onboarding', 'Kumkaribisha mfanyakazi mpya', 'Intégration d’un employé'),
    description: t('From signed contract to a confident first month.', 'Kuanzia mkataba uliosainiwa hadi mwezi wa kwanza wenye ujasiri.', 'Du contrat signé à un premier mois serein.'),
    tasks: [
      { title: t('Send offer letter and employment contract', 'Tuma barua ya ofa na mkataba wa ajira', 'Envoyer la lettre d’offre et le contrat de travail'), offset: -10, priority: 'high', points: 1, tags: ['onboarding', 'hr'] },
      { title: t('Collect KRA PIN, NSSF, SHA and bank details', 'Kusanya PIN ya KRA, NSSF, SHA na maelezo ya benki', 'Récupérer le PIN KRA, NSSF, SHA et les coordonnées bancaires'), offset: -5, priority: 'high', points: 1, tags: ['onboarding', 'payroll'] },
      { title: t('Prepare laptop, email and app accounts', 'Andaa kompyuta, barua pepe na akaunti za programu', 'Préparer l’ordinateur, l’e-mail et les comptes'), offset: -3, priority: 'high', points: 2, tags: ['onboarding', 'it'] },
      { title: t('Invite to OrbitOS and add to payroll', 'Mwalike kwenye OrbitOS na umweke kwenye mishahara', 'Inviter dans OrbitOS et ajouter à la paie'), offset: -2, priority: 'medium', points: 1, tags: ['onboarding'] },
      { title: t('Welcome call and team introductions', 'Simu ya kumkaribisha na kumtambulisha kwa timu', 'Appel de bienvenue et présentation à l’équipe'), offset: 0, priority: 'high', points: 1, tags: ['onboarding'] },
      { title: t('Assign an onboarding buddy', 'Mpe mwenzake wa kumwongoza', 'Désigner un parrain d’intégration'), offset: 0, priority: 'medium', points: 1, tags: ['onboarding'] },
      { title: t('Complete security awareness training', 'Kamilisha mafunzo ya uelewa wa usalama', 'Suivre la formation de sensibilisation à la sécurité'), offset: 5, priority: 'medium', points: 1, tags: ['onboarding', 'compliance'] },
      { title: t('30-day check-in conversation', 'Mazungumzo ya siku 30', 'Point d’étape à 30 jours'), offset: 30, priority: 'medium', points: 1, tags: ['onboarding'] },
    ],
  },
  {
    id: 'month_end', icon: 'event_available',
    name: t('Month-end close', 'Kufunga mwezi', 'Clôture mensuelle'),
    description: t('Reconcile, pay, invoice and report, every month.', 'Linganisha hesabu, lipa, toa ankara na ripoti, kila mwezi.', 'Rapprocher, payer, facturer et rendre compte, chaque mois.'),
    tasks: [
      { title: t('Reconcile M-Pesa and bank statements', 'Linganisha taarifa za M-Pesa na benki', 'Rapprocher les relevés M-Pesa et bancaires'), offset: 0, priority: 'high', points: 3, tags: ['finance'] },
      { title: t('Approve pending expenses', 'Idhinisha gharama zinazosubiri', 'Approuver les dépenses en attente'), offset: 0, priority: 'high', points: 1, tags: ['finance'] },
      { title: t('Run payroll and share payslips', 'Endesha mishahara na utume hati za mishahara', 'Lancer la paie et partager les bulletins'), offset: 1, priority: 'critical', points: 3, tags: ['finance', 'payroll'] },
      { title: t('Send invoices and follow up overdue ones', 'Tuma ankara na fuatilia zilizochelewa', 'Envoyer les factures et relancer les impayés'), offset: 1, priority: 'high', points: 2, tags: ['finance'] },
      { title: t('Review burn rate and runway', 'Kagua kiwango cha matumizi na muda wa fedha', 'Revoir le taux de dépense et la trésorerie'), offset: 3, priority: 'medium', points: 1, tags: ['finance'] },
      { title: t('Share the monthly report with the board', 'Shiriki ripoti ya mwezi na bodi', 'Partager le rapport mensuel avec le conseil'), offset: 5, priority: 'medium', points: 1, tags: ['finance', 'reporting'] },
    ],
  },
  {
    id: 'kra', icon: 'receipt_long',
    name: t('KRA monthly filing (Kenya)', 'Uwasilishaji wa kila mwezi KRA (Kenya)', 'Déclarations mensuelles KRA (Kenya)'),
    description: t('Set the start date to the 1st of the month. Check current deadlines on kra.go.ke.', 'Weka tarehe ya kuanza siku ya 1 ya mwezi. Hakiki tarehe za mwisho kwenye kra.go.ke.', 'Choisissez le 1er du mois comme date de début. Vérifiez les échéances sur kra.go.ke.'),
    tasks: [
      { title: t('File PAYE return on iTax', 'Wasilisha PAYE kwenye iTax', 'Déclarer le PAYE sur iTax'), offset: 8, priority: 'critical', points: 2, tags: ['tax', 'kra'] },
      { title: t('Remit NSSF, SHIF and Housing Levy', 'Lipa NSSF, SHIF na Ushuru wa Nyumba', 'Verser NSSF, SHIF et la taxe logement'), offset: 8, priority: 'critical', points: 2, tags: ['tax', 'payroll'] },
      { title: t('Check every invoice reached KRA eTIMS', 'Hakiki kila ankara imefika KRA eTIMS', 'Vérifier que chaque facture est transmise à KRA eTIMS'), offset: 14, priority: 'high', points: 1, tags: ['tax', 'etims'] },
      { title: t('File VAT return', 'Wasilisha ritani ya VAT', 'Déposer la déclaration de TVA'), offset: 19, priority: 'critical', points: 2, tags: ['tax', 'kra'] },
      { title: t('Remit withholding tax', 'Lipa kodi ya zuio', 'Reverser la retenue à la source'), offset: 19, priority: 'high', points: 1, tags: ['tax', 'kra'] },
    ],
  },
  {
    id: 'launch', icon: 'rocket_launch',
    name: t('Product launch', 'Kuzindua bidhaa', 'Lancement de produit'),
    description: t('Plan, prepare and learn from a launch.', 'Panga, jiandae na ujifunze kutokana na uzinduzi.', 'Planifier, préparer et tirer les leçons d’un lancement.'),
    tasks: [
      { title: t('Agree launch goals and success measures', 'Kubaliana malengo na vipimo vya mafanikio', 'Fixer les objectifs et indicateurs de réussite'), offset: -21, priority: 'high', points: 2, tags: ['launch'] },
      { title: t('Final testing and bug fixes', 'Majaribio ya mwisho na kurekebisha hitilafu', 'Tests finaux et corrections'), offset: -7, priority: 'critical', points: 5, tags: ['launch', 'qa'] },
      { title: t('Write the announcement and social posts', 'Andika tangazo na machapisho ya mitandao', 'Rédiger l’annonce et les publications'), offset: -5, priority: 'high', points: 2, tags: ['launch', 'marketing'] },
      { title: t('Update website and pricing page', 'Sasisha tovuti na ukurasa wa bei', 'Mettre à jour le site et la page tarifs'), offset: -3, priority: 'high', points: 2, tags: ['launch', 'marketing'] },
      { title: t('Brief the support team', 'Elimisha timu ya huduma kwa wateja', 'Former l’équipe support'), offset: -2, priority: 'medium', points: 1, tags: ['launch', 'support'] },
      { title: t('Launch day', 'Siku ya uzinduzi', 'Jour du lancement'), offset: 0, priority: 'critical', points: 3, tags: ['launch'] },
      { title: t('Post-launch review', 'Tathmini baada ya uzinduzi', 'Bilan après lancement'), offset: 14, priority: 'medium', points: 1, tags: ['launch'] },
    ],
  },
  {
    id: 'client', icon: 'handshake',
    name: t('Client project kickoff', 'Kuanzisha mradi wa mteja', 'Lancement d’un projet client'),
    description: t('From signed contract to final invoice.', 'Kuanzia mkataba uliosainiwa hadi ankara ya mwisho.', 'Du contrat signé à la facture finale.'),
    tasks: [
      { title: t('Signed contract and deposit invoice', 'Mkataba uliosainiwa na ankara ya malipo ya awali', 'Contrat signé et facture d’acompte'), offset: 0, priority: 'critical', points: 1, tags: ['client'] },
      { title: t('Kickoff meeting with the client', 'Mkutano wa kuanza na mteja', 'Réunion de lancement avec le client'), offset: 2, priority: 'high', points: 1, tags: ['client'] },
      { title: t('Share project plan and timeline', 'Shiriki mpango na ratiba ya mradi', 'Partager le plan et le calendrier'), offset: 4, priority: 'high', points: 2, tags: ['client'] },
      { title: t('First progress update', 'Taarifa ya kwanza ya maendeleo', 'Premier point d’avancement'), offset: 11, priority: 'medium', points: 1, tags: ['client'] },
      { title: t('Delivery and client sign-off', 'Kukabidhi na idhini ya mteja', 'Livraison et validation du client'), offset: 30, priority: 'critical', points: 3, tags: ['client'] },
      { title: t('Send the final invoice', 'Tuma ankara ya mwisho', 'Envoyer la facture finale'), offset: 31, priority: 'high', points: 1, tags: ['client', 'finance'] },
    ],
  },
  {
    id: 'offboarding', icon: 'logout',
    name: t('Employee offboarding', 'Kuachana na mfanyakazi', 'Départ d’un employé'),
    description: t('A clean, respectful exit. Set the start date to the last working day.', 'Kuachana kwa heshima na mpangilio. Weka tarehe ya kuanza siku ya mwisho ya kazi.', 'Un départ propre et respectueux. Choisissez le dernier jour travaillé comme date de début.'),
    tasks: [
      { title: t('Hand over open tasks and documents', 'Kabidhi kazi na nyaraka zilizo wazi', 'Transférer les tâches et documents en cours'), offset: -5, priority: 'high', points: 2, tags: ['offboarding'] },
      { title: t('Exit conversation', 'Mazungumzo ya kuondoka', 'Entretien de départ'), offset: -2, priority: 'medium', points: 1, tags: ['offboarding', 'hr'] },
      { title: t('Collect laptop and company equipment', 'Kusanya kompyuta na vifaa vya kampuni', 'Récupérer l’ordinateur et le matériel'), offset: 0, priority: 'high', points: 1, tags: ['offboarding', 'it'] },
      { title: t('Remove access (Settings → Members and other apps)', 'Ondoa ruhusa (Mipangilio → Wanachama na programu nyingine)', 'Retirer les accès (Paramètres → Membres et autres outils)'), offset: 0, priority: 'critical', points: 1, tags: ['offboarding', 'security'] },
      { title: t('Final pay and certificate of service', 'Malipo ya mwisho na cheti cha utumishi', 'Solde de tout compte et certificat de travail'), offset: 7, priority: 'critical', points: 2, tags: ['offboarding', 'payroll'] },
    ],
  },
];

/** yyyy-MM-dd + n days. */
export function addDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

/** The rows a template creates, in one language. */
export function templateRows(tpl: Template, lang: Language, start: string, opts: { orgId: string; assigneeId: string | null; sprintId: string | null }) {
  return tpl.tasks.map((x) => ({
    org_id: opts.orgId, sprint_id: opts.sprintId, assignee_id: opts.assigneeId, title: x.title[lang], priority: x.priority,
    points: x.points, tags: x.tags, due_on: addDays(start, x.offset), status: 'todo' as const,
  }));
}

/**
 * Automatic first-week checklist when someone joins through an invite. "member" tasks go to the new person,
 * "manager" tasks to whoever invited them (or the owner). Due dates count from the day they join.
 */
export interface MemberTask extends TemplateTask { who: 'member' | 'manager' }
export const NEW_MEMBER_TASKS: MemberTask[] = [
  { who: 'member', title: t('Complete your profile: photo, job title, time zone and working hours', 'Kamilisha wasifu wako: picha, cheo, saa za kanda na saa za kazi', 'Compléter votre profil : photo, poste, fuseau horaire et heures de travail'), offset: 0, priority: 'high', points: 1, tags: ['onboarding'] },
  { who: 'member', title: t('Turn on two-factor sign-in', 'Washa uthibitishaji wa hatua mbili', 'Activer la double authentification'), offset: 1, priority: 'high', points: 1, tags: ['onboarding', 'security'] },
  { who: 'member', title: t('Read the team handbook and policies', 'Soma mwongozo na sera za timu', 'Lire le guide et les politiques de l’équipe'), offset: 2, priority: 'medium', points: 1, tags: ['onboarding'] },
  { who: 'member', title: t('Post your first daily check-in', 'Tuma ripoti yako ya kwanza ya kila siku', 'Publier votre premier point quotidien'), offset: 1, priority: 'medium', points: 1, tags: ['onboarding'] },
  { who: 'member', title: t('Complete security awareness training', 'Kamilisha mafunzo ya uelewa wa usalama', 'Suivre la formation de sensibilisation à la sécurité'), offset: 5, priority: 'medium', points: 1, tags: ['onboarding', 'compliance'] },
  { who: 'manager', title: t('Welcome call with {name}', 'Simu ya kumkaribisha {name}', 'Appel de bienvenue avec {name}'), offset: 0, priority: 'high', points: 1, tags: ['onboarding'] },
  { who: 'manager', title: t('Assign {name} an onboarding buddy', 'Mpe {name} mwenzake wa kumwongoza', 'Désigner un parrain d’intégration pour {name}'), offset: 1, priority: 'medium', points: 1, tags: ['onboarding'] },
  { who: 'manager', title: t('Set {name}’s first-month goals', 'Weka malengo ya mwezi wa kwanza ya {name}', 'Fixer les objectifs du premier mois de {name}'), offset: 3, priority: 'medium', points: 1, tags: ['onboarding'] },
  { who: 'manager', title: t('30-day check-in conversation with {name}', 'Mazungumzo ya siku 30 na {name}', 'Point d’étape à 30 jours avec {name}'), offset: 30, priority: 'medium', points: 1, tags: ['onboarding'] },
];
