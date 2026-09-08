'use client';

import React, { useRef } from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import { FolderOpen, Image, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  exportFlowToBpmn,
  parseFlowImportFile,
  type FlowImportPayload,
} from '@/lib/flowExport';
import { isPreviewId } from '@/lib/flowAppend';

const toolbarGroupClass =
  'flex items-center overflow-hidden rounded border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800 dark:shadow-lg';

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-9 w-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />;
}

type Props = {
  name: string;
  onImport: (payload: FlowImportPayload) => void;
  onExportPng: () => Promise<void>;
};

export function FlowFileToolbar({ name, onImport, onExportPng }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rf = useReactFlow();

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const payload = await parseFlowImportFile(file);
      onImport(payload);
      if (payload.importWarnings?.length) {
        console.warn('Avisos na importação:', payload.importWarnings);
        toast(
          'Diagrama importado com alguns avisos. Verifique os elementos.',
          { icon: '⚠️', duration: 5000 },
        );
      } else {
        toast.success('Diagrama importado com sucesso!');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao abrir arquivo';
      toast.error(message);
    }
  };

  const handleDownloadImage = async () => {
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    if (nodes.filter((n) => !isPreviewId(n.id)).length === 0) {
      toast.error('Adicione elementos ao fluxograma antes de exportar');
      return;
    }
    try {
      await onExportPng();
      toast.success('Imagem PNG baixada');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao exportar PNG');
    }
  };

  const handleDownloadBpmn = () => {
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    if (nodes.filter((n) => !isPreviewId(n.id) && n.type !== 'bpmnLane').length === 0) {
      toast.error('Adicione elementos ao fluxograma antes de exportar');
      return;
    }
    exportFlowToBpmn(name, nodes, edges, rf);
    toast.success('Arquivo BPMN baixado');
  };

  return (
    <Panel position="top-right" className="!m-0 !p-0" style={{ top: 12, right: 12 }}>
      <div className="flex items-center gap-2">
        <div className={toolbarGroupClass}>
          <ToolbarButton title="Abrir arquivo do computador" onClick={handleOpenFile}>
            <FolderOpen className="h-[18px] w-[18px] stroke-[1.75]" />
          </ToolbarButton>
        </div>

        <div className={toolbarGroupClass}>
          <ToolbarButton title="Baixar em BPMN" onClick={handleDownloadBpmn}>
            <Download className="h-[18px] w-[18px] stroke-[1.75]" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton title="Baixar como imagem (PNG)" onClick={handleDownloadImage}>
            <Image className="h-[18px] w-[18px] stroke-[1.75]" />
          </ToolbarButton>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.bpmn,.xml,application/json,text/xml"
        className="hidden"
        onChange={handleFileChange}
      />
    </Panel>
  );
}
