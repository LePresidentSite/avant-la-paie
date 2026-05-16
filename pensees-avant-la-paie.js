// ============================================================
// AVANT LA PAIE — 100 pensées positives sur l'argent
// Ton: sage et inspirant. Mélange tutoiement/neutre.
// Quelques-unes spécifiquement TDAH-friendly.
// ============================================================

const PENSEES = [
  // --- Sagesse générale sur l'argent ---
  { titre: "Calme financier", texte: "L'argent n'aime pas le chaos. Donne-lui une place, et il cesse de te courir après." },
  { titre: "Un pas à la fois", texte: "Un budget n'est pas une cage. C'est une carte qui te montre où tu peux aller." },
  { titre: "Petites rivières", texte: "Les petites dépenses sont des rivières : seules elles semblent rien, ensemble elles creusent des canyons." },
  { titre: "Clarté", texte: "Savoir où va ton argent, c'est déjà reprendre du pouvoir sur lui." },
  { titre: "Le futur toi", texte: "Chaque dollar mis de côté est un message d'amour à la personne que tu seras demain." },
  { titre: "Sérénité", texte: "Un compte qu'on regarde sans peur vaut plus que n'importe quel chiffre." },
  { titre: "Direction", texte: "Ce n'est pas combien tu gagnes qui te libère, c'est de savoir où ça s'en va." },
  { titre: "Respire", texte: "Planifier avant la paie, c'est s'offrir le luxe de respirer après." },
  { titre: "Ancrage", texte: "On ne contrôle pas le vent, mais on peut ajuster les voiles. Ton budget, c'est tes voiles." },
  { titre: "Patience", texte: "La richesse tranquille se construit comme une cathédrale : une pierre, puis une autre." },

  { titre: "Honnêteté", texte: "Le premier pas vers la paix financière, c'est de regarder les vrais chiffres en face, sans se juger." },
  { titre: "Liberté", texte: "Économiser, ce n'est pas se priver. C'est s'acheter des choix pour plus tard." },
  { titre: "Le bon rythme", texte: "Mieux vaut un petit montant chaque paie qu'un grand projet qui ne commence jamais." },
  { titre: "Simplicité", texte: "Un plan simple que tu respectes bat un plan parfait que tu abandonnes." },
  { titre: "Gratitude", texte: "Avant de penser à ce qui manque, remarque ce que ton argent a déjà rendu possible." },
  { titre: "Le pouvoir du non", texte: "Chaque « non » à une dépense inutile est un « oui » à quelque chose qui compte vraiment." },
  { titre: "Constance", texte: "Ce n'est pas l'intensité qui bâtit la sécurité, c'est la régularité." },
  { titre: "Recommencer", texte: "Un budget déraillé n'est pas un échec. C'est juste une invitation à recommencer, sans drame." },
  { titre: "Présence", texte: "Allouer ton argent à l'avance, c'est décider une fois pour ne plus avoir à hésiter cent fois." },
  { titre: "Le vrai luxe", texte: "Le vrai luxe, c'est d'ouvrir son application bancaire sans serrer les dents." },

  { titre: "Ton argent, tes règles", texte: "Tu n'obéis pas à ton budget. C'est lui qui travaille pour toi." },
  { titre: "Petites victoires", texte: "Une enveloppe remplie, même petite, c'est une promesse tenue envers toi-même." },
  { titre: "Le poids qui s'allège", texte: "Chaque dépense prévue est un poids de moins sur tes épaules le jour où elle arrive." },
  { titre: "Avancer", texte: "On n'a pas besoin d'avoir tout compris pour commencer. On comprend en avançant." },
  { titre: "Douceur", texte: "Sois aussi patiente avec tes finances que tu le serais avec une amie qui apprend." },
  { titre: "La paix avant la paie", texte: "Quand tout est planifié d'avance, la paie devient un soulagement, pas une course." },
  { titre: "Choisir", texte: "Budgéter, ce n'est pas perdre sa liberté. C'est choisir où la mettre." },
  { titre: "Le futur se construit", texte: "Demain n'arrive pas par hasard. Il se prépare un dollar à la fois." },
  { titre: "Confiance", texte: "Plus tu regardes tes chiffres souvent, moins ils te font peur." },
  { titre: "Léger", texte: "Un budget clair, c'est un esprit plus léger et un sommeil plus profond." },

  // --- TDAH-friendly ---
  { titre: "Ton cerveau cherche", texte: "Ton cerveau cherche de la dopamine. Aujourd'hui, trouve-la dans une bonne décision plutôt qu'un achat impulsif." },
  { titre: "Hors de la tête", texte: "Ce qui est écrit ne pèse plus dans ta tête. Note-le, et libère ton esprit." },
  { titre: "L'impulsion qui passe", texte: "L'envie d'acheter monte vite et redescend vite. Attends une nuit : souvent, elle disparaît." },
  { titre: "Pas de honte", texte: "Si gérer l'argent a toujours été dur pour toi, ce n'est pas un défaut de caractère. C'est juste un cerveau différent qui mérite des outils différents." },
  { titre: "Une chose à la fois", texte: "Tu n'as pas à tout régler aujourd'hui. Une enveloppe, une décision, ça suffit." },
  { titre: "Le système, pas la volonté", texte: "Ne compte pas sur ta volonté. Compte sur un système qui pense à ta place." },
  { titre: "Visible = réel", texte: "Pour ton cerveau, ce qui n'est pas visible n'existe pas. C'est pour ça que voir ton plan change tout." },
  { titre: "Célèbre maintenant", texte: "N'attends pas d'avoir tout réussi pour être fière. Célèbre le petit geste d'aujourd'hui." },
  { titre: "Ramener doucement", texte: "Ton attention va partir. C'est normal. Le but n'est pas de ne jamais dévier, mais de revenir avec douceur." },
  { titre: "Externalise", texte: "Ta mémoire est précieuse mais surchargée. Laisse l'application se souvenir à ta place." },

  // --- Suite sagesse générale ---
  { titre: "Le calme se cultive", texte: "La paix avec l'argent n'est pas un talent inné. Elle se cultive, geste après geste." },
  { titre: "Assez", texte: "Connaître son « assez » est une richesse que les chiffres ne donnent pas." },
  { titre: "Le premier dollar", texte: "Le premier dollar épargné est le plus difficile. Après, c'est une habitude qui te porte." },
  { titre: "Sans culpabilité", texte: "Dépenser pour ce qui compte vraiment n'est pas un gaspillage. C'est le but." },
  { titre: "La marée", texte: "Les revenus montent et descendent comme la marée. Un plan, c'est ta digue." },
  { titre: "Tranquillité", texte: "L'argent bien rangé fait moins de bruit dans la tête." },
  { titre: "Ce qui dure", texte: "Les habitudes discrètes d'aujourd'hui deviennent la stabilité de demain." },
  { titre: "Permission", texte: "Tu as le droit de te tromper avec l'argent. Tu as aussi le droit de recommencer." },
  { titre: "Un geste suffit", texte: "Ouvrir cette application aujourd'hui était déjà un acte de soin envers toi." },
  { titre: "Le cap", texte: "Peu importe la vitesse, tant que la direction est bonne." },

  { titre: "Préparer, c'est protéger", texte: "Prévoir une dépense, c'est désamorcer une crise avant qu'elle n'éclate." },
  { titre: "Plus jamais surprise", texte: "Une facture prévue ne fait plus mal. Elle attend simplement son tour." },
  { titre: "Ton rythme", texte: "Il n'y a pas de bon rythme universel. Il y a le tien, et il est valable." },
  { titre: "Le silence des chiffres", texte: "Quand tout est alloué, les chiffres se taisent et l'esprit se repose." },
  { titre: "Petit coussin", texte: "Garder un petit coussin, ce n'est pas de la méfiance. C'est de la tendresse pour ton futur." },
  { titre: "L'argent suit l'attention", texte: "Là où va ton attention, ton argent suit. Choisis bien où tu regardes." },
  { titre: "Recommencer sans drame", texte: "Tomber n'est pas grave. Rester à terre, oui. Relève le plan, tranquillement." },
  { titre: "Fierté tranquille", texte: "La vraie fierté n'est pas bruyante. C'est ce calme intérieur quand tout est en ordre." },
  { titre: "Un budget vivant", texte: "Un budget n'est pas gravé dans la pierre. Il respire et s'ajuste avec ta vie." },
  { titre: "Maintenant", texte: "Le meilleur moment pour mettre de l'ordre, ce n'était pas hier. C'est maintenant." },

  { titre: "La paix se planifie", texte: "On ne tombe pas par hasard dans la sérénité financière. On la planifie." },
  { titre: "Chaque décision compte", texte: "Aucune bonne décision n'est trop petite pour compter." },
  { titre: "Le poids invisible", texte: "L'argent non planifié pèse même quand on n'y pense pas. Range-le, et sens-toi plus léger." },
  { titre: "Ta valeur", texte: "Ta valeur ne se mesure pas à ton solde bancaire. Mais bien gérer ce solde t'offre de la paix." },
  { titre: "Lentement mais sûrement", texte: "La tortue qui avance bat le lièvre qui abandonne." },
  { titre: "L'effet boule de neige", texte: "Une bonne habitude en attire une autre. Commence par la plus petite." },
  { titre: "Sans comparaison", texte: "Le budget du voisin ne te regarde pas. Le tien, oui." },
  { titre: "Respire avant d'acheter", texte: "Entre l'envie et l'achat, glisse une respiration. C'est souvent suffisant." },
  { titre: "Ton allié", texte: "Ce n'est pas toi contre l'argent. C'est toi avec un plan." },
  { titre: "La clarté apaise", texte: "L'incertitude inquiète. La clarté apaise. Choisis de voir clair." },

  { titre: "Le courage du quotidien", texte: "Il faut du courage pour regarder ses finances. Tu l'as fait aujourd'hui." },
  { titre: "Construire", texte: "On ne construit pas la sécurité d'un coup. On la pose une brique à la fois." },
  { titre: "Le luxe de prévoir", texte: "Prévoir, c'est s'offrir le luxe de ne plus paniquer." },
  { titre: "Doucement vers l'avant", texte: "Avancer doucement reste avancer. Le mouvement compte plus que la vitesse." },
  { titre: "Ranger pour respirer", texte: "Ranger son argent, c'est comme aérer une pièce : tout devient plus respirable." },
  { titre: "L'habitude porte", texte: "Au début, tu portes l'habitude. Ensuite, c'est elle qui te porte." },
  { titre: "Tendresse", texte: "Parle-toi de ton argent comme tu parlerais à quelqu'un que tu aimes : avec patience." },
  { titre: "Le chemin se révèle", texte: "Tu n'as pas besoin de voir tout le chemin. Juste le prochain pas." },
  { titre: "Assez planifié", texte: "Un budget n'a pas à être parfait. Il a juste à être assez bon pour aujourd'hui." },
  { titre: "Présent et serein", texte: "Quand demain est prévu, on peut enfin habiter le présent." },

  { titre: "Le calme se choisit", texte: "Entre la panique et le plan, il y a un choix. Choisis le plan." },
  { titre: "Petits ruisseaux", texte: "Les petits montants régulièrement mis de côté deviennent de grandes tranquillités." },
  { titre: "Sans jugement", texte: "Regarde tes dépenses comme un scientifique, pas comme un juge." },
  { titre: "Le pouvoir de revoir", texte: "Revoir son budget n'est pas un échec de planification. C'est de l'intelligence." },
  { titre: "Un jour donné", texte: "Tu n'as pas à être parfaite tous les jours. Juste présente aujourd'hui." },
  { titre: "L'argent au service de la vie", texte: "L'argent n'est pas le but. C'est un outil au service de ce que tu aimes." },
  { titre: "La sécurité se tisse", texte: "La sécurité financière se tisse de gestes invisibles, jour après jour." },
  { titre: "Reviens au plan", texte: "Quand tu te sens perdue, ne cherche pas plus loin : reviens simplement au plan." },
  { titre: "Ce que tu mérites", texte: "Tu mérites un rapport apaisé avec l'argent. Et ça se construit, ça ne se mérite pas par souffrance." },
  { titre: "L'instant suffit", texte: "Cet instant, cette décision, ce petit geste : c'est déjà assez." },

  { titre: "La paix est un muscle", texte: "La tranquillité financière est un muscle. Chaque bonne décision l'entraîne." },
  { titre: "Garder le cap", texte: "Les tempêtes passent. Le cap, lui, te ramène toujours au port." },
  { titre: "Moins de bruit", texte: "Moins de dettes mentales, c'est moins de bruit dans une journée déjà pleine." },
  { titre: "Ta façon", texte: "Il n'existe pas qu'une seule bonne façon de gérer l'argent. Il y a la tienne, qui fonctionne pour toi." },
  { titre: "Le premier geste", texte: "Le plus dur est de commencer. Tu l'as déjà fait en ouvrant ceci." },
  { titre: "Avancer en paix", texte: "On peut avancer vite et stressé, ou doucement et serein. Choisis la sérénité." },
  { titre: "L'ordre intérieur", texte: "Quand l'argent est en ordre dehors, quelque chose s'apaise aussi en dedans." },
  { titre: "Recommencer est permis", texte: "Tu peux remettre les compteurs à zéro autant de fois que la vie le demande." },
  { titre: "Suffisamment", texte: "Tu en fais déjà suffisamment. Le simple fait d'essayer compte." },
  { titre: "Vers le calme", texte: "Chaque petite décision te rapproche du calme. Continue, à ton rythme." }
];

if (typeof window !== 'undefined') {
  window.PENSEES = PENSEES;
}
