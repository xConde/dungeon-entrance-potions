# Dungeon Entrance Potions

A shop game about the last stop before a dungeon. Price potions, equip each visitor, and see how those choices affect the expedition below.

Originally part of [edconde.com](https://edconde.com); this repository holds the standalone game. Runs are seeded, audio is synthesized in the browser, and saves remain in local storage. There is no account or backend.

## Run locally

```sh
npm ci
npm start
```

`npm run typecheck`, `npm run test:ci`, and `npm run build` check the production code, simulation rules, and build. The app uses Angular 21. Clearing site data resets your saved game.

## License

Application code is [MIT licensed](LICENSE). Bundled font licenses are included beside the font files in `public/assets/fonts`. Inline Phosphor icon paths are covered by the [Phosphor Icons license](third_party/PHOSPHOR-LICENSE).
