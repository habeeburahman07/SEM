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
import { BulkImportMembersDto } from './dto/bulk-import-members.dto';

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

  @Get('sports')
  getSports() {
    return this.workspacesService.getSports();
  }

  @Get('invitations/pending')
  getPendingInvitations(@Request() req: any) {
    return this.workspacesService.getPendingInvitations(req.user.id);
  }

  @Post('invitations/:workspaceId/accept')
  acceptInvitation(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    return this.workspacesService.acceptInvitation(workspaceId, req.user.id);
  }

  @Post('invitations/:workspaceId/reject')
  rejectInvitation(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    return this.workspacesService.rejectInvitation(workspaceId, req.user.id);
  }

  @Get('notifications')
  getNotifications(@Request() req: any) {
    return this.workspacesService.getNotifications(req.user.id);
  }

  @Post('notifications/read')
  markNotificationsRead(@Request() req: any) {
    return this.workspacesService.markNotificationsRead(req.user.id);
  }

  @Get('dashboard/overview')
  getDashboardOverview(@Request() req: any) {
    return this.workspacesService.getDashboardOverview(req.user.id);
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

  @Post(':id/members/bulk')
  bulkImportMembers(
    @Param('id') id: string,
    @Body() dto: BulkImportMembersDto,
    @Request() req: any,
  ) {
    return this.workspacesService.bulkImportMembers(id, dto, req.user.id);
  }

  @Post(':id/join')
  joinWorkspace(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.workspacesService.joinWorkspace(id, req.user.id);
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
  }
}
