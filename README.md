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

- **Files**: every `.trb` file of the project, outside `node_modules` and hidden folders.
- **Structure**: the faces of each `view` and `layout` in the file, nested as written. Drag a face among the
  ones beside it to move it; *Up* and *Down* do the same.
- **Preview**: the screen as it looks, laid out without running any of the program's code.
- **Properties**: the text a face shows, the name of a field, whether it is required; *Delete* takes it out.
- **Add**: a heading, text, field, long text, number, date, choice, checkbox, button, row or panel, after the
  chosen face.
- **Code**: the file itself. Change it here and the structure and preview follow; change the design and the
  code follows. Code that does not load says why, and is not saved.

*Save* writes the file. Leaving a file with changes asks first.

## How it keeps your code

The text of the file is the truth: the designer keeps the design nowhere else. It reads the values of the file
and where each one sits in the text (`load-spans`), and lays out each screen as `trebol check` does
(`ui-sketch`), so every face knows the text it was written with. A change rewrites only that text: a new label
replaces the old string, a face that moves takes its comment with it, a face that goes takes its line.

## On a web page

With no project behind it, as on trebol-lang.com, it shows a sample project; *Save* downloads the file.

## License

Apache-2.0.
