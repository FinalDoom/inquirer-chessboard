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
import type {PartialDeep} from "@inquirer/type";

type ChessboardTheme = {
    icon: {
        /** defaults to figures.radioOff */
        unselected: string;
        /** defaults to characters a-z */
        optionsList: string[];
    };
    style: {
        selectedIcon: (icon: string) => string;
        unselectedIcon: (icon: string) => string;
        selectedOption: (option: string) => string;
        unselectedOption: (option: string) => string;
        selectedCell: (icon: string) => string;
        unselectedCell: (icon: string) => string;
        renderOption: <T>(option: Option<T>, optionIcon: string) => string;
    };
    optionsDisplay: 'right' | 'top' | 'bottom';
};

const chessboardTheme: ChessboardTheme = {
    icon: {
        unselected: figures.radioOff,
        optionsList: [...'abcdefghijklmnopqrstuvwxyz'],
    },
    style: {
        selectedIcon: (icon) => chalk.bold(icon),
        unselectedIcon: (icon) => icon,
        selectedOption: (option) => chalk.bold(option),
        unselectedOption: (option) => option,
        selectedCell: (icon) => chalk.bold('[ ') + icon + chalk.bold(' ]'),
        unselectedCell: (icon) => `  ${icon}  `,
        renderOption: (option, optionIcon) => `${optionIcon}. ${option.name}`
    },
    optionsDisplay: 'right',
};

type Option<Value> = { name: string; value: Value }

export type Config<Value> = {
    message: string;
    columns: number;
    rows: number;
    options: Option<Value>[];

    /** default unlabelled */
    rowLabels?: string[];
    /** default unlabeled */
    columnLabels?: string[];
    /** style chessboard with options to cli-table */
    tableOptions?: Omit<ConstructorParameters<typeof Table>[0], 'head' | 'rows'>
    /** default true */
    wrapColumns?: boolean;
    /** default true */
    wrapRows?: boolean;
    theme?: PartialDeep<Theme<ChessboardTheme>>;
}

function addOptionsToTable(table: Table, options: string[]) {
    const tableLines = table.toString().split('\n');
    const tableHeight = tableLines.length;
    const paddedTableLines = tableHeight >= options.length ? tableLines : tableLines.concat(
        new Array(options.length - tableHeight).fill(''.padEnd(tableLines[tableLines.length - 1]?.length ?? 0, ' ')));

    return paddedTableLines.map((line, i) => i < options.length ? `${line}\t${options[i]}` : line).join('\n');
}

function validateConfig<Value>(config: Config<Value>, theme: ChessboardTheme) {
    const {options, columns, columnLabels, rows, rowLabels} = config;
    if (options.length > theme.icon.optionsList.length) {
        console.warn("More config.options passed than can be displayed with config.theme.icon.optionsList icons.")
    }
    if (columnLabels !== undefined && columns !== columnLabels.length) {
        console.warn(`Incorrect number of columns labels passed (should equal columns: ${columns})`)
    }
    if (rowLabels !== undefined && rows !== rowLabels.length) {
        console.warn(`Incorrect number of row labels passed (should equal rows: ${rows})`)
    }
}

export default createPrompt(<Value extends unknown>(config: Config<Value>, done: (value: Array<Array<Value | undefined>>) => void) => {
    const {
        options,
        columns,
        rows,
        message,
        columnLabels: configColumnLabels = undefined,
        rowLabels = undefined,
        tableOptions = {},
        wrapColumns = true,
        wrapRows = true
    } = config;
    const theme = makeTheme<ChessboardTheme>(chessboardTheme, config.theme);
    validateConfig(config, theme);
    const [columnLabels, setColumnLabels] = useState<string[] | undefined>(configColumnLabels)
    useEffect(() => {
        if (rowLabels !== undefined && columnLabels !== undefined) {
            setColumnLabels(["", ...columnLabels]);
        }
    }, []);

    const [value, setValue] = useState<ReadonlyArray<ReadonlyArray<number | undefined>>>(
        new Array(rows).fill(undefined).map(() => new Array(columns).fill(undefined)),
    );
    const [columnPosition, setColumnPosition] = useState(0);
    const [rowPosition, setRowPosition] = useState(0);
    const prefix = usePrefix({});

    useKeypress((key) => {
        if (isEnterKey(key)) {
            const mappedValues = value.map((row) =>
                row.map((value) =>
                    value === undefined ? undefined : options[value]!.value,
                ),
            );
            done(mappedValues);
        } else if (isDownKey(key)) {
            if (rowPosition < rows || (wrapRows ?? true)) {
                setRowPosition((rowPosition + 1) % rows);
            }
        } else if (isUpKey(key)) {
            if (rowPosition > 0 || (wrapRows ?? true)) {
                setRowPosition((((rowPosition - 1) % rows) + rows) % rows);
            }
        } else if (isSpaceKey(key)) {
            const changedRow = [...value[rowPosition]!];
            changedRow[columnPosition] = ((((changedRow[columnPosition] ?? -1) + 1) % options.length) + options.length) % options.length;
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
                    if (columnPosition > 0 || (wrapColumns ?? true)) {
                        setColumnPosition((((columnPosition - 1) % columns) + columns) % columns);
                    }
                    break;
                case 'right':
                    if (columnPosition < columns || (wrapColumns ?? true)) {
                        setColumnPosition((columnPosition + 1) % columns);
                    }
                    break;
            }
        }
    });

    const table = new Table({...tableOptions, style: {head: [], ...tableOptions.style}, head: columnLabels ?? []});
    table.push(
        ...value.map((row, rowNumber) => {
                const displayRow = row.map((value, columnNumber) => {
                    const icon = (value === undefined ? undefined : theme.icon.optionsList[value]) ?? theme.icon.unselected;
                    const selected = rowNumber === rowPosition && columnNumber === columnPosition;
                    const styledIcon = selected ? theme.style.selectedIcon(icon) : theme.style.unselectedIcon(icon);
                    return selected ? theme.style.selectedCell(styledIcon) : theme.style.unselectedCell(styledIcon);
                });
                if (rowLabels !== undefined) {
                    displayRow.unshift(rowLabels[rowNumber] ?? '');
                }
                return displayRow;
            }
        ),
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
    const optionsDisplay = ['Options:', ...options.map((option, i) => {
        const optionString = theme.style.renderOption(option, theme.icon.optionsList[i]!);
        return i === selectedOption ?
            theme.style.selectedOption(optionString) :
            theme.style.unselectedOption(optionString);
    })]
    const tableWithOptions = theme.optionsDisplay === 'top' ? `${optionsDisplay.join('\n')}\n\n${table}` :
        theme.optionsDisplay === 'bottom' ?
            `${table}\n\n${optionsDisplay.join('\n')}` :
            // Default right display
            addOptionsToTable(table, optionsDisplay);

    return `${prefix} ${message}\n${helpTipTop}\n${tableWithOptions}${ansiEscapes.cursorHide}`;
});
