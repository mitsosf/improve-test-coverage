/**
 * Port for AI provider factory
 * Infrastructure provides the adapter implementation
 */

import { AiProvider as AiProviderType } from '../entities/ImprovementJob';
import { IAiProvider } from './IAiProvider';

export interface IAiProviderFactory {
  /**
   * Get an AI provider by type
   */
  getProvider(type: AiProviderType): IAiProvider;

  /**
   * Get all available AI providers
   */
  getAvailableProviders(): Promise<AiProviderType[]>;
}

export const AI_PROVIDER_FACTORY = Symbol('IAiProviderFactory');
