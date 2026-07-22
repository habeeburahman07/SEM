import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlayersService } from './players.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/players')
@UseGuards(JwtAuthGuard)
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  getPlayers(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    return this.playersService.getPlayers(workspaceId, req.user.id);
  }

  @Post()
  createPlayer(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreatePlayerDto,
    @Request() req: any,
  ) {
    return this.playersService.createPlayer(workspaceId, dto, req.user.id);
  }

  @Patch(':playerId')
  updatePlayer(
    @Param('workspaceId') workspaceId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdatePlayerDto,
    @Request() req: any,
  ) {
    return this.playersService.updatePlayer(workspaceId, playerId, dto, req.user.id);
  }

  @Delete(':playerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePlayer(
    @Param('workspaceId') workspaceId: string,
    @Param('playerId') playerId: string,
    @Request() req: any,
  ) {
    return this.playersService.removePlayer(workspaceId, playerId, req.user.id);
  }

  @Get(':playerId/stats')
  getPlayerStats(
    @Param('workspaceId') workspaceId: string,
    @Param('playerId') playerId: string,
    @Request() req: any,
  ) {
    return this.playersService.getPlayerStats(workspaceId, playerId, req.user.id);
  }
}
