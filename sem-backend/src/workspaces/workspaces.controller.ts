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
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRole } from './entities/workspace-member.entity';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';


@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}


  // ─── Workspace CRUD ───────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateWorkspaceDto, @Request() req: any) {
    return this.workspacesService.create(dto, req.user.id);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.workspacesService.findAllForUser(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
    @Request() req: any,
  ) {
    return this.workspacesService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.remove(id, req.user.id);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  @Get(':id/members')
  getMembers(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.getMembers(id, req.user.id);
  }

  @Post(':id/members')
  inviteMember(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @Request() req: any,
  ) {
    return this.workspacesService.inviteMember(id, dto, req.user.id);
  }

  @Patch(':id/members/:userId')
  updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Request() req: any,
  ) {
    return this.workspacesService.updateMemberRole(id, userId, dto, req.user.id);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.workspacesService.removeMember(id, userId, req.user.id);
  }

  // ─── Roles ────────────────────────────────────────────────────────────────

  @Get(':id/roles')
  getRoles(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.getRoles(id, req.user.id);
  }

  @Post(':id/roles')
  createRole(
    @Param('id') id: string,
    @Body() dto: CreateRoleDto,
    @Request() req: any,
  ) {
    return this.workspacesService.createRole(id, dto, req.user.id);
  }

  @Delete(':id/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Request() req: any,
  ) {
    return this.workspacesService.removeRole(id, roleId, req.user.id);
  }

  // ─── Teams ────────────────────────────────────────────────────────────────

  @Get(':id/teams')
  getTeams(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.getTeams(id, req.user.id);
  }

  @Post(':id/teams')
  createTeam(
    @Param('id') id: string,
    @Body() dto: CreateTeamDto,
    @Request() req: any,
  ) {
    return this.workspacesService.createTeam(id, dto, req.user.id);
  }

  @Patch(':id/teams/:teamId')
  updateTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
    @Request() req: any,
  ) {
    return this.workspacesService.updateTeam(id, teamId, dto, req.user.id);
  }

  @Delete(':id/teams/:teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.workspacesService.removeTeam(id, teamId, req.user.id);
  }
}
