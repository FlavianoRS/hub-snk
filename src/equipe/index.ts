/**
 * Módulo Equipe do Projeto (GP): equipe e Pessoas do projeto, agenda da equipe com reserva na
 * Agenda de Recursos, Nova Tarefa na Experience, Meet, cronograma ao cliente, Resumo das
 * equipes e status do Sankhya ID. Specs: `docs/specs/reserva-agenda-recursos-gp.md`,
 * `resumo-equipes-gp.md`, `cronograma-cliente-gp.md`, `status-sankhya-id-gp.md`.
 *
 * Entra no servidor por `registrarEquipe`; o que precisa do Hub vem pelas portas
 * (`portas.ts`), ligadas em `adaptadoresDoHub.ts`.
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { AgendaDaEquipe, type PonteDoHub } from './agendaDaEquipe.ts';
import { ExperienceDaEquipe, type ApiDaExperience } from './experienceDaEquipe.ts';
import type { EmailDaEquipe, RepositorioDaEquipe } from './portas.ts';
import { registrarRotasDeEquipeDoProjeto } from './rotasEquipeDoProjeto.ts';
import { registrarRotasDeNovaTarefa } from './rotasNovaTarefa.ts';
import { registrarRotasDoProjetoDaEquipe } from './rotasDoProjeto.ts';

export interface DependenciasDaEquipe {
  ponte: PonteDoHub;
  experience: ApiDaExperience;
  repositorio: RepositorioDaEquipe;
  email: EmailDaEquipe;
  log?: FastifyBaseLogger;
}

export function registrarEquipe(
  servidor: FastifyInstance,
  dependencias: DependenciasDaEquipe,
): void {
  const agenda = new AgendaDaEquipe(dependencias.ponte);
  const experience = new ExperienceDaEquipe(dependencias.experience);
  registrarRotasDeNovaTarefa(
    servidor,
    agenda,
    experience,
    dependencias.repositorio,
    dependencias.log,
  );
  registrarRotasDeEquipeDoProjeto(servidor, agenda, experience, dependencias.repositorio);
  registrarRotasDoProjetoDaEquipe(servidor, dependencias.repositorio, dependencias.email);
}
