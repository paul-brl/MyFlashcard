# Memorix — Flashcards médicales

Application de flashcards avec répétition espacée (algorithme SM-2) pour étudiants en médecine.

## Fonctionnalités
- Algorithme SM-2 adaptatif (Apprentissage → Révision → Réapprentissage)
- Paquets hiérarchisés : Prioritaire / Important / Utile
- Révision globale cross-matières
- Interface admin protégée par mot de passe
- Filtre journalier de nouvelles cartes
- Persistance via localStorage

## Installation

```bash
npm install
npm run dev
```

## Déploiement

```bash
npm run build
# Le dossier dist/ contient le site prêt à déployer
```

## Mot de passe admin
`medecine2024` (à changer dans `src/App.jsx` → variable `ADMIN_PASSWORD`)
