/**
 * Re-export move tree utilities from components/ChessMoveTree.tsx
 *
 * This provides a clean import path for board code:
 * import { AnalysisController, TreePath } from '@/board/core/move-tree';
 *
 * The canonical implementation stays in components/ChessMoveTree.tsx
 */

export {
  AnalysisController,
  TreeOps,
  TreePath,
  findVariationRoot,
  generateVariationName,
} from "@/components/ChessMoveTree";

export type { TreeNode, LLMMessage } from "@/components/ChessMoveTree";
