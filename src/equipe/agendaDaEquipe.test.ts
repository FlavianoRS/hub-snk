import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pessoasCorrespondem } from './agendaDaEquipe.ts';

describe('pessoasCorrespondem', () => {
  it('casa login nome.sobrenome da Agenda com o nome completo da Experience', () => {
    assert.equal(pessoasCorrespondem('FLAVIANO.SANTOS', 'Flaviano Rodrigues Dos Santos'), true);
    assert.equal(pessoasCorrespondem('André Segatto', 'ANDRE.SEGATTO'), true);
    assert.equal(pessoasCorrespondem('GUSTAVO.PINTO', 'Gustavo Ricardo Pinto'), true);
  });

  it('não casa primeiro nome diferente nem sobrenome ausente', () => {
    assert.equal(pessoasCorrespondem('ANDRE.SEGATTO', 'Gustavo Ricardo Pinto'), false);
    assert.equal(pessoasCorrespondem('FLAVIANO.SOUZA', 'Flaviano Rodrigues Dos Santos'), false);
    assert.equal(pessoasCorrespondem('', 'Naiane Costa'), false);
  });
});
