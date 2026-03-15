Place your real static images in this folder and update `manifest.js` with the filenames you want the app to render.

Grouping rule:
- The app groups by the filename prefix before ` - `.
- Example: `Person - Front profile.jpg` and `Person - Side profile.jpg` both render under the `Person` group.

Why the manifest exists:
- GitHub Pages and similar static hosting can serve known files from a folder.
- They cannot list the contents of a directory at runtime.
- `manifest.js` is the explicit list of image paths the app loads.

These placeholder SVGs are only here so the app works immediately and can be deleted later.
