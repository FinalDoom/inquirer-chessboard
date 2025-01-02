import chalk from 'chalk';
import figures from 'figures';
import Table from 'cli-table';

import {
  createPrompt,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  makeTheme,
  type Theme,
  useEffect,
  useKeypress,
  usePrefix,
  useState,
} from '@inquirer/core';
import ansiEscapes from 'ansi-escapes';
import type { PartialDeep } from '@inquirer/type';
import stripAnsi from 'strip-ansi';

const mod = (number: number, modulus: number): number => ((number % modulus) + modulus) % modulus;

interface ChessboardTheme {
  icon: {
    /** defaults to figures.radioOff */
    unselected: string;
    /** defaults to characters a-z */
    optionsList: string[];
  };
  style: {
    selectedIcon: (icon: string) => string;
    unselectedIcon: (icon: string) => string;
    renderIcon: (isSelected: boolean, icon: string) => string;
    selectedOption: (option: string) => string;
    unselectedOption: (option: string) => string;
    renderOption: <T>(isSelected: boolean, option: Option<T>, optionIcon: string) => string;
    selectedCell: (icon: string) => string;
    unselectedCell: (icon: string) => string;
    renderCell: (isSelected: boolean, value: number | undefined) => string;
  };
  optionsDisplay: 'right' | 'top' | 'bottom';
}

const defaultChessboardThemeClass: { theme: ChessboardTheme } = new (class {
  theme: ChessboardTheme = {
    icon: {
      unselected: figures.radioOff,
      optionsList: [...'abcdefghijklmnopqrstuvwxyz'],
    },
    style: {
      selectedIcon: (icon) => chalk.bold(icon),
      unselectedIcon: (icon) => icon,
      renderIcon: (isSelected: boolean, icon: string) =>
        isSelected ? this.theme.style.selectedIcon(icon) : this.theme.style.unselectedIcon(icon),
      selectedOption: (option) => chalk.bold(option),
      unselectedOption: (option) => option,
      renderOption: (isSelected, option, optionIcon) => {
        const optionLine = `${this.theme.style.renderIcon(isSelected, optionIcon)}. ${option.name}`;
        return isSelected ? this.theme.style.selectedOption(optionLine) : this.theme.style.unselectedOption(optionLine);
      },
      selectedCell: (icon) => chalk.bold('[ ') + icon + chalk.bold(' ]'),
      unselectedCell: (icon) => `  ${icon}  `,
      renderCell: (isSelected, value) => {
        const icon =
          (value === undefined ? undefined : this.theme.icon.optionsList[value]) ?? this.theme.icon.unselected;
        const styledIcon = isSelected ? this.theme.style.selectedIcon(icon) : this.theme.style.unselectedIcon(icon);
        return isSelected ? this.theme.style.selectedCell(styledIcon) : this.theme.style.unselectedCell(styledIcon);
      },
    },
    optionsDisplay: 'right',
  };
})();
const chessboardTheme = defaultChessboardThemeClass.theme;

interface Option<Value> {
  name: string;
  value: Value;
}

export interface Config<Value> {
  message: string;
  columns: number;
  rows: number;
  options: Array<Option<Value>>;

  /** default unlabelled */
  rowLabels?: string[];
  /** default unlabeled */
  columnLabels?: string[];
  /** style chessboard with options to cli-table */

  tableOptions?: Omit<ConstructorParameters<typeof Table>[0], 'head' | 'rows'>;
  /** default true */
  wrapColumns?: boolean;
  /** default true */
  wrapRows?: boolean;
  theme?: PartialDeep<Theme<ChessboardTheme>>;
}

const buildTableWithOptions = (display: ChessboardTheme['optionsDisplay'], table: Table, options: string[]): string => {
  switch (display) {
    case 'top':
      return `${options.join('\n')}\n\n${table.toString()}`;
    case 'bottom':
      return `${table.toString()}\n\n${options.join('\n')}`;
    case 'right': {
      // default
      const tableLines = table.toString().split('\n');

      const tableHeight = tableLines.length;
      const paddedTableLines =
        tableHeight >= options.length
          ? tableLines
          : tableLines.concat(new Array(options.length - tableHeight).fill(''.padEnd(tableLines.at(-1)!.length, ' ')));

      return paddedTableLines.map((line, i) => (i < options.length ? `${line}\t${options[i]}` : line)).join('\n');
    }
  }
};

const validateConfig = <Value,>(config: Config<Value>, theme: ChessboardTheme): void => {
  const { options, columns, columnLabels, rows, rowLabels } = config;
  if (options.length > theme.icon.optionsList.length) {
    console.warn('More config.options passed than can be displayed with config.theme.icon.optionsList icons.');
  }
  if (columnLabels !== undefined && columns !== columnLabels.length) {
    console.warn(`Incorrect number of columns labels passed (should equal columns: ${columns})`);
  }
  if (rowLabels !== undefined && rows !== rowLabels.length) {
    console.warn(`Incorrect number of row labels passed (should equal rows: ${rows})`);
  }
  if (stripAnsi(theme.style.selectedCell('a')).length !== stripAnsi(theme.style.unselectedCell('a')).length) {
    console.warn(`Selected and unselected cell style should result in same length for best display`);
    console.warn(theme.style.selectedCell('a').length, theme.style.unselectedCell('a'));
    console.warn(theme.style.unselectedCell('a').length, theme.style.unselectedCell('a'));
  }
};

export default createPrompt(
  <Value extends unknown>(config: Config<Value>, done: (value: Array<Array<Value | undefined>>) => void) => {
    const {
      options,
      columns,
      rows,
      message,
      columnLabels: configColumnLabels = undefined,
      rowLabels = undefined,
      tableOptions = {},
      wrapColumns = true,
      wrapRows = true,
    } = config;
    const theme = makeTheme<ChessboardTheme>(chessboardTheme, config.theme);
    validateConfig(config, theme);

    const [columnLabels, setColumnLabels] = useState<string[] | undefined>(configColumnLabels);
    useEffect(() => {
      if (rowLabels !== undefined && columnLabels !== undefined) {
        setColumnLabels(['', ...columnLabels]);
      }
    }, []);

    const [value, setValue] = useState<ReadonlyArray<ReadonlyArray<number | undefined>>>(
      new Array(rows).fill(undefined).map(() => new Array<number | undefined>(columns).fill(undefined)),
    );
    const [columnPosition, setColumnPosition] = useState(0);
    const [rowPosition, setRowPosition] = useState(0);
    const prefix = usePrefix({});

    useKeypress((key) => {
      if (isEnterKey(key)) {
        const resolveOption = (value: number | undefined): Value | undefined =>
          value === undefined ? undefined : options[value]!.value;
        done(value.map((row) => row.map(resolveOption)));
      } else if (isDownKey(key)) {
        if (rowPosition < rows || wrapRows) {
          setRowPosition(mod(rowPosition + 1, rows));
        }
      } else if (isUpKey(key)) {
        if (rowPosition > 0 || wrapRows) {
          setRowPosition(mod(rowPosition + -1, rows));
        }
      } else if (isSpaceKey(key)) {
        const changedRow = [...value[rowPosition]!];
        changedRow[columnPosition] = mod((changedRow[columnPosition] ?? -1) + 1, options.length);
        const newValue = [...value];
        newValue[rowPosition] = changedRow;
        setValue(newValue);
      } else if (isBackspaceKey(key)) {
        const changedRow = [...value[rowPosition]!];
        changedRow[columnPosition] = undefined;
        const newValue = [...value];
        newValue[rowPosition] = changedRow;
        setValue(newValue);
      } else {
        switch (key.name) {
          case 'left':
            if (columnPosition > 0 || wrapColumns) {
              setColumnPosition(mod(columnPosition + -1, columns));
            }
            break;
          case 'right':
            if (columnPosition < columns || wrapColumns) {
              setColumnPosition(mod(columnPosition + 1, columns));
            }
            break;
        }
      }
    });

    const table = new Table({ ...tableOptions, style: { head: [], ...tableOptions.style }, head: columnLabels ?? [] });
    table.push(
      ...value.map((row, rowNumber) => {
        const displayRow = row.map((value, columnNumber) => {
          const isSelected = rowNumber === rowPosition && columnNumber === columnPosition;
          return theme.style.renderCell(isSelected, value);
        });
        if (rowLabels !== undefined) {
          displayRow.unshift(rowLabels[rowNumber] ?? '');
        }
        return displayRow;
      }),
    );

    const keys = [
      `${theme.style.key('up')} and ${theme.style.key('down')} to move rows`,
      `${theme.style.key('left')} and ${theme.style.key('right')} to move columns`,
      `${theme.style.key('space')} to rotate selected option`,
      `${theme.style.key('backspace')} to clear selected option`,
      `and ${theme.style.key('enter')} to proceed`,
    ];
    const helpTipTop = `Press ${keys.join(', ')}.`;

    const selectedOption = value[rowPosition]![columnPosition];
    const optionsDisplay = [
      'Options:',
      ...options.map((option, i) => theme.style.renderOption(i === selectedOption, option, theme.icon.optionsList[i]!)),
    ];
    const tableWithOptions = buildTableWithOptions(theme.optionsDisplay, table, optionsDisplay);

    return `${prefix} ${message}\n${helpTipTop}\n${tableWithOptions}${ansiEscapes.cursorHide}`;
  },
);
