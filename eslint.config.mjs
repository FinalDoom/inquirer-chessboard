import love from 'eslint-config-love';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  {
    ...love,
    files: ['src/**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'prettier/prettier': 'error'
    }
  },
  {
    ...eslintPluginPrettierRecommended,
    files: ['src/**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'prettier/prettier': 'error'
    }
  }
];