import type { MessageKey } from './en';

/** Français. Machine-assisted draft — have a native speaker review before marketing it. */
export const fr: Partial<Record<MessageKey, string>> = {
  'wa.checkin.saved': 'Merci {name} ! Votre point du jour pour {org} est enregistré. Humeur {mood}/5.',
  'wa.checkin.which_org': 'Vous faites partie de plusieurs espaces. Répondez à un rappel pour que je sache lequel est concerné.',
  'wa.checkin.no_org': "Vous n'êtes membre actif d'aucun espace qui reçoit des points du jour.",
  'wa.checkin.read_only': "{org} est en lecture seule pour le moment : le point du jour n'a pas été enregistré.",
  'wa.checkin.too_short': 'Dites-m’en un peu plus sur ce que vous avez livré (quelques mots au moins).',
  'wa.unknown_number': "Ce numéro n'est lié à aucun compte OrbitOS. Liez-le dans Profil → WhatsApp.",
  'wa.help': 'OrbitOS sur WhatsApp :\n• Répondez à un rappel avec ce que vous avez livré aujourd’hui. Commencez par un chiffre de 1 à 5 pour votre humeur, et ajoutez « Blocages : » si quelque chose vous freine.\n• Appuyez sur Approuver ou Refuser pour les dépenses.\n• Envoyez STOP pour mettre en pause, START pour reprendre.',
  'wa.stopped': 'C’est fait : vous ne recevrez plus de rappels ni de demandes d’approbation sur WhatsApp. Envoyez START pour les réactiver.',
  'wa.started': 'C’est reparti : les rappels et les demandes d’approbation arriveront ici.',
  'wa.expense.approved': 'Approuvée : {what}. L’équipe peut la voir dans Opérations → Finances.',
  'wa.expense.rejected': 'Refusée : {what}.',
  'wa.expense.already_approved': 'Cette dépense est déjà approuvée.',
  'wa.expense.already_rejected': 'Cette dépense est déjà refusée.',
  'wa.expense.forbidden': 'Seuls les propriétaires et directeurs de l’espace peuvent décider des dépenses.',
  'wa.expense.own': 'Vous ne pouvez pas approuver votre propre dépense : un autre propriétaire ou directeur doit le faire.',
  'wa.expense.not_found': 'Cette dépense n’existe plus.',
  'wa.expense.read_only': 'L’espace est en lecture seule pour le moment : rien n’a été modifié.',
  'wa.unsupported': 'Je sais lire les messages texte et les boutons. Envoyez HELP pour voir ce que je sais faire.',
};
