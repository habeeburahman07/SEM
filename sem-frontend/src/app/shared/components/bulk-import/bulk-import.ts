import { Component, input, output, model, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../button/button';

export interface BulkImportFieldMapping {
  titleKey: string;
  subtitleKey?: string;
  subtitleLabel?: string;
  detailKey?: string;
  detailLabel?: string;
  extraKey?: string;
  extraLabel?: string;
}

@Component({
  selector: 'app-bulk-import',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './bulk-import.html',
})
export class BulkImportComponent {
  // Modal visibility
  isOpen = model<boolean>(false);

  // Configuration Texts
  title = input<string>('Bulk Import');
  description = input<string>('Upload a spreadsheet to register multiple items at once.');
  step1Title = input<string>('1. Prepare your spreadsheet');
  step1Description = input<string>('Make sure your Excel columns match the template structure.');
  step2Title = input<string>('2. Upload spreadsheet file');
  
  // Field Display Mappings
  fieldMapping = input.required<BulkImportFieldMapping>();

  // Optional password input for Member import
  showPasswordInput = input<boolean>(false);
  password = model<string>('');
  showPassword = signal<boolean>(false);

  // State bindings from Parent
  bulkImportError = model<string>('');
  bulkImportSuccess = model<string>('');
  bulkImportProgress = input<number>(0);
  isImporting = input<boolean>(false);
  items = model<any[]>([]);

  // Outputs
  downloadTemplateClicked = output<void>();
  confirmImportClicked = output<void>();
  excelParsed = output<any[]>();

  // Local drop/drag file upload states
  isDragOver = signal<boolean>(false);

  closeModal() {
    this.isOpen.set(false);
    this.bulkImportError.set('');
    this.bulkImportSuccess.set('');
    this.items.set([]);
    this.password.set('');
  }

  downloadTemplate() {
    this.downloadTemplateClicked.emit();
  }

  async onExcelUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    await this.processFile(input.files[0]);
    input.value = '';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave() {
    this.isDragOver.set(false);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      await this.processFile(event.dataTransfer.files[0]);
    }
  }

  private async processFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        this.excelParsed.emit(json);
      } catch (err) {
        console.error('Failed to parse file', err);
        this.bulkImportError.set('Failed to parse spreadsheet. Please ensure it is a valid format.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  onConfirmImport() {
    this.confirmImportClicked.emit();
  }
}
