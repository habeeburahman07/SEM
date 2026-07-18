import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { CreateSportDto } from './dto/create-sport.dto';
import { UpdateSportDto } from './dto/update-sport.dto';

@Controller('system-settings')
@UseGuards(JwtAuthGuard)
export class SystemSettingsController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  // ─── Global Roles ─────────────────────────────────────────────────────────

  @Get('roles')
  getGlobalRoles() {
    return this.workspacesService.getGlobalRoles();
  }

  @Post('roles')
  @UseGuards(SuperAdminGuard)
  createGlobalRole(@Body() dto: CreateRoleDto, @Req() req: any) {
    const role = this.workspacesService.createGlobalRole(dto);
    this.workspacesService.logAudit(
      'CREATE_GLOBAL_ROLE',
      'MASTER_DATA',
      'Role',
      undefined,
      req.user?.userId,
      req.user?.username,
      `Created role ${dto.name}`,
    );
    return role;
  }

  @Patch('roles/:roleId')
  @UseGuards(SuperAdminGuard)
  updateGlobalRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: any,
  ) {
    const role = this.workspacesService.updateGlobalRole(roleId, dto);
    this.workspacesService.logAudit(
      'UPDATE_GLOBAL_ROLE',
      'MASTER_DATA',
      'Role',
      roleId,
      req.user?.userId,
      req.user?.username,
      `Updated role ${roleId}`,
    );
    return role;
  }

  @Delete('roles/:roleId')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeGlobalRole(@Param('roleId') roleId: string, @Req() req: any) {
    this.workspacesService.logAudit(
      'DELETE_GLOBAL_ROLE',
      'MASTER_DATA',
      'Role',
      roleId,
      req.user?.userId,
      req.user?.username,
      `Deleted role ${roleId}`,
    );
    return this.workspacesService.removeGlobalRole(roleId);
  }

  // ─── Global Permissions ───────────────────────────────────────────────────

  @Get('permissions')
  getGlobalPermissions() {
    return this.workspacesService.getGlobalPermissions();
  }

  @Post('permissions')
  @UseGuards(SuperAdminGuard)
  createPermission(@Body() dto: CreatePermissionDto, @Req() req: any) {
    const perm = this.workspacesService.createPermission(dto);
    this.workspacesService.logAudit(
      'CREATE_PERMISSION',
      'MASTER_DATA',
      'Permission',
      undefined,
      req.user?.userId,
      req.user?.username,
      `Created permission ${dto.name} (${dto.slug})`,
    );
    return perm;
  }

  @Patch('permissions/:permissionId')
  @UseGuards(SuperAdminGuard)
  updatePermission(
    @Param('permissionId') permissionId: string,
    @Body() dto: UpdatePermissionDto,
    @Req() req: any,
  ) {
    const perm = this.workspacesService.updatePermission(permissionId, dto);
    this.workspacesService.logAudit(
      'UPDATE_PERMISSION',
      'MASTER_DATA',
      'Permission',
      permissionId,
      req.user?.userId,
      req.user?.username,
      `Updated permission ${permissionId}`,
    );
    return perm;
  }

  @Delete('permissions/:permissionId')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePermission(@Param('permissionId') permissionId: string, @Req() req: any) {
    this.workspacesService.logAudit(
      'DELETE_PERMISSION',
      'MASTER_DATA',
      'Permission',
      permissionId,
      req.user?.userId,
      req.user?.username,
      `Deleted permission ${permissionId}`,
    );
    return this.workspacesService.deletePermission(permissionId);
  }

  @Post('roles/:roleId/permissions')
  @UseGuards(SuperAdminGuard)
  updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body('permissionIds') permissionIds: string[],
    @Req() req: any,
  ) {
    this.workspacesService.logAudit(
      'UPDATE_ROLE_PERMISSIONS',
      'MASTER_DATA',
      'Role',
      roleId,
      req.user?.userId,
      req.user?.username,
      `Assigned ${permissionIds?.length || 0} permissions to role ${roleId}`,
    );
    return this.workspacesService.updateRolePermissions(roleId, permissionIds);
  }

  // ─── Global Sports ────────────────────────────────────────────────────────

  @Get('sports')
  getSports() {
    return this.workspacesService.getSports();
  }

  @Post('sports')
  @UseGuards(SuperAdminGuard)
  createSport(@Body() dto: CreateSportDto, @Req() req: any) {
    const sport = this.workspacesService.createSport(dto);
    this.workspacesService.logAudit(
      'CREATE_SPORT',
      'MASTER_DATA',
      'Sport',
      undefined,
      req.user?.userId,
      req.user?.username,
      `Created sport ${dto.name} (${dto.code})`,
    );
    return sport;
  }

  @Patch('sports/:sportId')
  @UseGuards(SuperAdminGuard)
  updateSport(
    @Param('sportId') sportId: string,
    @Body() dto: UpdateSportDto,
    @Req() req: any,
  ) {
    const sport = this.workspacesService.updateSport(sportId, dto);
    this.workspacesService.logAudit(
      'UPDATE_SPORT',
      'MASTER_DATA',
      'Sport',
      sportId,
      req.user?.userId,
      req.user?.username,
      `Updated sport ${sportId}`,
    );
    return sport;
  }

  @Delete('sports/:sportId')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSport(@Param('sportId') sportId: string, @Req() req: any) {
    this.workspacesService.logAudit(
      'DELETE_SPORT',
      'MASTER_DATA',
      'Sport',
      sportId,
      req.user?.userId,
      req.user?.username,
      `Deleted sport ${sportId}`,
    );
    return this.workspacesService.deleteSport(sportId);
  }

  // ─── System Audit Logs & Monitoring ────────────────────────────────────────

  @Get('audit-logs')
  @UseGuards(SuperAdminGuard)
  getAuditLogs(@Query('category') category?: string, @Query('limit') limit?: number) {
    return this.workspacesService.getAuditLogs(category, limit ? Number(limit) : 100);
  }

  @Delete('audit-logs')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  clearAuditLogs(@Req() req: any) {
    this.workspacesService.logAudit(
      'CLEAR_AUDIT_LOGS',
      'SECURITY',
      'AuditLog',
      undefined,
      req.user?.userId,
      req.user?.username,
      'Cleared system audit logs history',
    );
    return this.workspacesService.clearAuditLogs();
  }

  @Get('monitoring')
  @UseGuards(SuperAdminGuard)
  getSystemMetrics() {
    return this.workspacesService.getSystemMetrics();
  }

  @Get('config')
  @UseGuards(SuperAdminGuard)
  getSystemConfigs() {
    return this.workspacesService.getSystemConfigs();
  }

  @Patch('config')
  @UseGuards(SuperAdminGuard)
  updateSystemConfig(
    @Body('key') key: string,
    @Body('value') value: string,
    @Req() req: any,
  ) {
    return this.workspacesService.updateSystemConfig(
      key,
      value,
      req.user?.userId,
      req.user?.username,
    );
  }
}
