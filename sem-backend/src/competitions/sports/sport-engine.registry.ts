import { Injectable } from '@nestjs/common';
import { SportEngine } from './sport-engine.interface';
import { FootballEngine } from './football.engine';
import { CricketEngine } from './cricket.engine';
import { BadmintonEngine } from './badminton.engine';

@Injectable()
export class SportEngineRegistry {
  private readonly engines = new Map<string, SportEngine>();

  constructor() {
    this.register(new FootballEngine());
    this.register(new CricketEngine());
    this.register(new BadmintonEngine());
  }

  register(engine: SportEngine): void {
    this.engines.set(engine.code, engine);
  }

  getEngine(sportCode: string): SportEngine {
    const engine = this.engines.get(sportCode);
    if (!engine) {
      // Fallback to FootballEngine as default if not found
      return this.engines.get('football')!;
    }
    return engine;
  }
}
