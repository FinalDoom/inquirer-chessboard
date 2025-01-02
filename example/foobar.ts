import chessboard from 'inquirer-chessboard';

const options = ['Foo', 'Bar', 'Baz'];

chessboard({
    message: 'Choose where to place each option on the grid:',
    columns: 3,
    rows: 3,
    options: options.map((option) => ({name: option, value: option})),
}).then((_) => {})