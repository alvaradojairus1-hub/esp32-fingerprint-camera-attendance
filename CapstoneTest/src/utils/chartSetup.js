// src/utils/chartSetup.js
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { accessibleChartPlugin } from './chartConfig';

// Register Chart.js components once centrally
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  accessibleChartPlugin
);

// Re-export everything from chartConfig
export * from './chartConfig';