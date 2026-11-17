# trebol-dev

The visual designer for [Trebol](https://trebol-lang.com/). It opens the screens of a Trebol project, lets you
change them by hand or with the mouse, and writes the code back: only what you changed, with your comments,
spacing and order kept as you wrote them.

```sh
npx trebol-dev            # the project in this folder
npx trebol-dev my-app     # or in another one
```

It opens on <http://localhost:5180/> (`--port` picks another). Only this machine reaches it.

## What it does

The window holds it all, with no page scroll: the structure on the left, the properties on the right, and in
the middle the preview, the code, or both side by side (*Design*, *Split*, *Code*). Each part scrolls by itself.

- **Files**: every `.trb` file of the project, outside `node_modules` and hidden folders.
- **Structure**: the faces of each `view` and `layout` in the file, nested as written. Drag a face among the
  ones beside it to move it; *Up* and *Down* do the same. *Add* has every style of Trebol, in groups
  (layout, text, input, choice, data, action, media): what it adds goes inside the chosen face when that face
  holds others (a panel, a row, a grid...), and after it otherwise.
- **Preview**: the screen as it looks, laid out without running any of the program's code. Click a face to
  choose it.
- **Code**: the file itself, coloured as Trebol, with the chosen face marked. Put the cursor in a face to
  choose it. Change the code and the structure and preview follow; change the design and the code follows.
  Code that does not load says why, and is not saved.
- **Properties**: the text a face shows, the name of a field, whether it is required, the columns of a grid
  (`3`, a weight for each as `1 2 1`, or `small 1` for a fixed side column); *Delete* takes it out.

A face chosen in one of them is chosen in all three.

*Save* writes the file. Leaving a file with changes asks first.

## How it keeps your code

The text of the file is the truth: the designer keeps the design nowhere else. It reads the values of the file
and where each one sits in the text (`load-spans`), and lays out each screen as `trebol check` does
(`ui-sketch`), so every face knows the text it was written with. A change rewrites only that text: a new label
replaces the old string, a face that moves takes its comment with it, a face that goes takes its line.

## On a web page

With no project behind it, as on trebol-lang.com, it shows a sample project; *Save* downloads the file.

## Building the code editor

The code view is CodeMirror 6, built into one file, `app/trebol-code.js`, from `editor/trebol-code.js`:
`npm install` and `npm run build:editor`. The built file is kept in the repository, so the designer needs
nothing else to run.

## License

Apache-2.0.
