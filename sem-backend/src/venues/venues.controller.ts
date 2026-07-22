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
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/venues')
@UseGuards(JwtAuthGuard)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  getVenues(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    return this.venuesService.getVenues(workspaceId, req.user.id);
  }

  @Post()
  createVenue(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateVenueDto,
    @Request() req: any,
  ) {
    return this.venuesService.createVenue(workspaceId, dto, req.user.id);
  }

  @Patch(':venueId')
  updateVenue(
    @Param('workspaceId') workspaceId: string,
    @Param('venueId') venueId: string,
    @Body() dto: UpdateVenueDto,
    @Request() req: any,
  ) {
    return this.venuesService.updateVenue(workspaceId, venueId, dto, req.user.id);
  }

  @Delete(':venueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVenue(
    @Param('workspaceId') workspaceId: string,
    @Param('venueId') venueId: string,
    @Request() req: any,
  ) {
    return this.venuesService.removeVenue(workspaceId, venueId, req.user.id);
  }
}
