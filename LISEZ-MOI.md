# Avant la Paie — Mode d'emploi

## Pour tester immédiatement sur ton téléphone

**Option 1 : Hébergement gratuit en 2 minutes (recommandé)**

1. Va sur https://app.netlify.com/drop
2. Glisse-dépose le dossier complet (les 6 fichiers)
3. Tu reçois un lien du genre `https://abc123.netlify.app`
4. Ouvre ce lien dans Chrome sur ton Android
5. Menu Chrome (⋮) → "Installer l'application" ou "Ajouter à l'écran d'accueil"

L'app apparaît comme une vraie application, fonctionne hors ligne, et garde tes données.

**Option 2 : Tester localement sur PC**

Dans le dossier, lance :
```
python3 -m http.server 8000
```
Puis ouvre `http://localhost:8000` dans ton navigateur.

## Comment l'app fonctionne

1. **Entre ta paie prévue** (montant + date)
2. **Crée des enveloppes** avant que l'argent arrive — chacune avec un montant
3. **Le compteur "Reste à allouer"** te montre en gros chaque dollar pas encore assigné
4. **Quand la paie tombe**, tu coches chaque enveloppe au fur et à mesure que tu mets l'argent de côté
5. Tout est sauvegardé automatiquement sur ton téléphone

## Pourquoi ça aide pour le TDAH

- **Anti-impulsivité** : décider AVANT, pas pendant
- **Visuel fort** : un seul gros chiffre coloré, pas de tableau confus
- **Dopamine** : cocher une enveloppe = petite récompense visuelle (✓ vert)
- **Compteur** "X / Y déposées" pour voir le progrès
- **Suggestions rapides** pour ne pas avoir à tout taper

## Pour aller plus loin

Une fois que tu utilises l'app, dis-moi ce qui manque ou ce qui frustre — on peut ajouter :
- Notifications/alertes la veille de la paie
- Plusieurs paies (si tu as plusieurs sources)
- Historique des paies passées
- Export/import des données
- Mode "dépenses imprévues" qui mange dans une enveloppe

Et si tu veux ensuite la transformer en vraie app Android dans le Play Store, c'est faisable en gardant le même code.
