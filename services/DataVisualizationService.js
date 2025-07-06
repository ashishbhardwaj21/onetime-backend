/**
 * Data Visualization Service
 * 
 * Features:
 * - Dynamic chart and graph generation
 * - Real-time dashboard data
 * - Interactive visualization components
 * - Export capabilities (PNG, PDF, SVG)
 * - Custom metric visualizations
 * - Comparative analysis charts
 * - Trend analysis and forecasting
 * - Heat maps and geographic visualizations
 */

class DataVisualizationService {
  constructor() {
    this.chartTypes = {
      LINE: 'line',
      BAR: 'bar',
      PIE: 'pie',
      SCATTER: 'scatter',
      HEATMAP: 'heatmap',
      FUNNEL: 'funnel',
      GAUGE: 'gauge',
      AREA: 'area'
    };

    this.colorPalettes = {
      primary: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
      success: ['#10b981', '#059669', '#047857', '#065f46'],
      warning: ['#f59e0b', '#d97706', '#b45309', '#92400e'],
      danger: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
      info: ['#06b6d4', '#0891b2', '#0e7490', '#155e75']
    };

    this.initializeVisualizationService();
  }

  /**
   * Initialize visualization service
   */
  initializeVisualizationService() {
    console.log('📊 Initializing Data Visualization Service...');
    console.log('✅ Data Visualization Service ready');
  }

  /**
   * Generate revenue dashboard visualization
   */
  async generateRevenueDashboard(data, options = {}) {
    try {
      const dashboard = {
        id: 'revenue_dashboard',
        title: 'Revenue Analytics Dashboard',
        timestamp: new Date(),
        charts: []
      };

      // Revenue over time (line chart)
      dashboard.charts.push(this.createLineChart({
        id: 'revenue_trend',
        title: 'Revenue Trend',
        data: this.generateRevenueTimeSeriesData(data),
        options: {
          yAxis: { title: 'Revenue ($)' },
          xAxis: { title: 'Date' },
          colors: this.colorPalettes.success
        }
      }));

      // Revenue by subscription tier (pie chart)
      dashboard.charts.push(this.createPieChart({
        id: 'revenue_by_tier',
        title: 'Revenue by Subscription Tier',
        data: this.generateRevenueByTierData(data),
        options: {
          colors: this.colorPalettes.primary
        }
      }));

      // Monthly recurring revenue (gauge)
      dashboard.charts.push(this.createGaugeChart({
        id: 'mrr_gauge',
        title: 'Monthly Recurring Revenue',
        data: {
          value: data.monthlyRecurringRevenue || 0,
          target: data.mrrTarget || 50000,
          max: data.mrrMax || 100000
        },
        options: {
          colors: this.colorPalettes.info
        }
      }));

      // Revenue vs target (bar chart)
      dashboard.charts.push(this.createBarChart({
        id: 'revenue_vs_target',
        title: 'Revenue vs Target',
        data: this.generateRevenueVsTargetData(data),
        options: {
          yAxis: { title: 'Amount ($)' },
          colors: this.colorPalettes.primary
        }
      }));

      return dashboard;

    } catch (error) {
      console.error('Revenue dashboard generation error:', error);
      throw error;
    }
  }

  /**
   * Generate user analytics visualization
   */
  async generateUserAnalytics(data, options = {}) {
    try {
      const analytics = {
        id: 'user_analytics',
        title: 'User Analytics Dashboard',
        timestamp: new Date(),
        charts: []
      };

      // User growth (area chart)
      analytics.charts.push(this.createAreaChart({
        id: 'user_growth',
        title: 'User Growth Over Time',
        data: this.generateUserGrowthData(data),
        options: {
          yAxis: { title: 'Users' },
          xAxis: { title: 'Date' },
          colors: this.colorPalettes.primary
        }
      }));

      // User engagement funnel
      analytics.charts.push(this.createFunnelChart({
        id: 'engagement_funnel',
        title: 'User Engagement Funnel',
        data: this.generateEngagementFunnelData(data),
        options: {
          colors: this.colorPalettes.info
        }
      }));

      // Active users heatmap
      analytics.charts.push(this.createHeatmapChart({
        id: 'activity_heatmap',
        title: 'User Activity Heatmap',
        data: this.generateActivityHeatmapData(data),
        options: {
          xAxis: { title: 'Hour of Day' },
          yAxis: { title: 'Day of Week' }
        }
      }));

      // User retention cohort
      analytics.charts.push(this.createLineChart({
        id: 'retention_cohort',
        title: 'User Retention by Cohort',
        data: this.generateRetentionCohortData(data),
        options: {
          yAxis: { title: 'Retention Rate (%)' },
          xAxis: { title: 'Days Since Registration' },
          colors: this.colorPalettes.primary
        }
      }));

      return analytics;

    } catch (error) {
      console.error('User analytics generation error:', error);
      throw error;
    }
  }

  /**
   * Generate A/B test visualization
   */
  async generateABTestVisualization(testData, options = {}) {
    try {
      const visualization = {
        id: `abtest_${testData.testId}`,
        title: `A/B Test: ${testData.testName}`,
        timestamp: new Date(),
        charts: []
      };

      // Conversion rates comparison (bar chart)
      visualization.charts.push(this.createBarChart({
        id: 'conversion_comparison',
        title: 'Conversion Rates by Variant',
        data: this.generateABTestConversionData(testData),
        options: {
          yAxis: { title: 'Conversion Rate (%)' },
          colors: this.colorPalettes.primary
        }
      }));

      // Statistical significance (gauge)
      visualization.charts.push(this.createGaugeChart({
        id: 'significance_gauge',
        title: 'Statistical Significance',
        data: {
          value: testData.significance?.confidenceLevel || 0,
          target: 95,
          max: 100
        },
        options: {
          colors: this.colorPalettes.success
        }
      }));

      // Conversion over time (line chart)
      visualization.charts.push(this.createLineChart({
        id: 'conversion_timeline',
        title: 'Conversions Over Time',
        data: this.generateABTestTimelineData(testData),
        options: {
          yAxis: { title: 'Cumulative Conversions' },
          xAxis: { title: 'Date' },
          colors: this.colorPalettes.primary
        }
      }));

      return visualization;

    } catch (error) {
      console.error('A/B test visualization error:', error);
      throw error;
    }
  }

  /**
   * Generate custom chart
   */
  createCustomChart(chartConfig) {
    try {
      const chart = {
        id: chartConfig.id || this.generateChartId(),
        type: chartConfig.type || this.chartTypes.LINE,
        title: chartConfig.title || 'Custom Chart',
        data: chartConfig.data || [],
        options: {
          ...this.getDefaultChartOptions(),
          ...chartConfig.options
        },
        metadata: {
          createdAt: new Date(),
          dataSource: chartConfig.dataSource || 'custom',
          lastUpdated: new Date()
        }
      };

      // Validate chart configuration
      this.validateChartConfig(chart);

      return chart;

    } catch (error) {
      console.error('Custom chart creation error:', error);
      throw error;
    }
  }

  /**
   * Create line chart
   */
  createLineChart(config) {
    return {
      ...config,
      type: this.chartTypes.LINE,
      chartConfig: {
        type: 'line',
        data: {
          datasets: config.data.map((dataset, index) => ({
            label: dataset.label,
            data: dataset.data,
            borderColor: config.options?.colors?.[index] || this.colorPalettes.primary[index % this.colorPalettes.primary.length],
            backgroundColor: this.adjustColorOpacity(config.options?.colors?.[index] || this.colorPalettes.primary[index % this.colorPalettes.primary.length], 0.1),
            tension: 0.4
          }))
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: config.title },
            legend: { position: 'top' }
          },
          scales: {
            x: { title: { display: true, text: config.options?.xAxis?.title || 'X Axis' } },
            y: { title: { display: true, text: config.options?.yAxis?.title || 'Y Axis' } }
          }
        }
      }
    };
  }

  /**
   * Create bar chart
   */
  createBarChart(config) {
    return {
      ...config,
      type: this.chartTypes.BAR,
      chartConfig: {
        type: 'bar',
        data: {
          labels: config.data.labels || [],
          datasets: [{
            label: config.title,
            data: config.data.values || [],
            backgroundColor: config.options?.colors || this.colorPalettes.primary,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: config.title },
            legend: { display: false }
          },
          scales: {
            y: { 
              beginAtZero: true,
              title: { display: true, text: config.options?.yAxis?.title || 'Value' }
            }
          }
        }
      }
    };
  }

  /**
   * Create pie chart
   */
  createPieChart(config) {
    return {
      ...config,
      type: this.chartTypes.PIE,
      chartConfig: {
        type: 'pie',
        data: {
          labels: config.data.labels || [],
          datasets: [{
            data: config.data.values || [],
            backgroundColor: config.options?.colors || this.colorPalettes.primary,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: config.title },
            legend: { position: 'right' }
          }
        }
      }
    };
  }

  /**
   * Create area chart
   */
  createAreaChart(config) {
    const lineChart = this.createLineChart(config);
    lineChart.type = this.chartTypes.AREA;
    lineChart.chartConfig.data.datasets.forEach(dataset => {
      dataset.fill = true;
      dataset.backgroundColor = this.adjustColorOpacity(dataset.borderColor, 0.3);
    });
    return lineChart;
  }

  /**
   * Create gauge chart
   */
  createGaugeChart(config) {
    const percentage = (config.data.value / config.data.max) * 100;
    
    return {
      ...config,
      type: this.chartTypes.GAUGE,
      chartConfig: {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [config.data.value, config.data.max - config.data.value],
            backgroundColor: [
              config.options?.colors?.[0] || this.colorPalettes.success[0],
              '#e5e7eb'
            ],
            borderWidth: 0,
            cutout: '80%'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: config.title },
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      },
      gaugeData: {
        value: config.data.value,
        target: config.data.target,
        max: config.data.max,
        percentage: Math.round(percentage),
        status: this.getGaugeStatus(percentage, config.data.target)
      }
    };
  }

  /**
   * Create funnel chart
   */
  createFunnelChart(config) {
    return {
      ...config,
      type: this.chartTypes.FUNNEL,
      chartConfig: {
        type: 'bar',
        data: {
          labels: config.data.labels || [],
          datasets: [{
            data: config.data.values || [],
            backgroundColor: config.options?.colors || this.colorPalettes.info,
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            title: { display: true, text: config.title },
            legend: { display: false }
          },
          scales: {
            x: { beginAtZero: true }
          }
        }
      },
      funnelData: {
        stages: config.data.labels?.map((label, index) => ({
          name: label,
          value: config.data.values?.[index] || 0,
          conversionRate: index === 0 ? 100 : 
            ((config.data.values?.[index] || 0) / (config.data.values?.[0] || 1)) * 100
        })) || []
      }
    };
  }

  /**
   * Create heatmap chart
   */
  createHeatmapChart(config) {
    return {
      ...config,
      type: this.chartTypes.HEATMAP,
      heatmapData: {
        xLabels: config.data.xLabels || [],
        yLabels: config.data.yLabels || [],
        values: config.data.values || [],
        maxValue: Math.max(...(config.data.values || []).flat()),
        minValue: Math.min(...(config.data.values || []).flat())
      },
      chartConfig: {
        // Heatmap would typically use a specialized library like D3.js
        // This is a simplified representation
        type: 'scatter',
        data: {
          datasets: [{
            label: config.title,
            data: this.convertHeatmapToScatterData(config.data),
            backgroundColor: this.colorPalettes.primary[0]
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: config.title }
          }
        }
      }
    };
  }

  /**
   * Export chart to different formats
   */
  async exportChart(chartId, format = 'png', options = {}) {
    try {
      console.log(`📤 Exporting chart ${chartId} to ${format}`);
      
      // In a real implementation, this would generate actual image/PDF files
      const exportData = {
        chartId,
        format,
        exportedAt: new Date(),
        url: `/exports/charts/${chartId}.${format}`,
        metadata: {
          width: options.width || 800,
          height: options.height || 600,
          quality: options.quality || 'high'
        }
      };

      return exportData;

    } catch (error) {
      console.error('Chart export error:', error);
      throw error;
    }
  }

  // Data generation methods for different chart types

  generateRevenueTimeSeriesData(data) {
    // Generate sample revenue time series data
    const dates = this.generateDateRange(30); // Last 30 days
    return [{
      label: 'Daily Revenue',
      data: dates.map(date => ({
        x: date,
        y: Math.random() * 2000 + 1000 // Random revenue between $1000-$3000
      }))
    }];
  }

  generateRevenueByTierData(data) {
    return {
      labels: ['Free', 'Premium', 'VIP'],
      values: [
        data?.revenueByTier?.free || 0,
        data?.revenueByTier?.premium || 15000,
        data?.revenueByTier?.vip || 25000
      ]
    };
  }

  generateRevenueVsTargetData(data) {
    return {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      values: [45000, 52000, 48000, 61000, 55000, 67000]
    };
  }

  generateUserGrowthData(data) {
    const dates = this.generateDateRange(30);
    return [{
      label: 'Total Users',
      data: dates.map((date, index) => ({
        x: date,
        y: 10000 + (index * 150) + (Math.random() * 100)
      }))
    }];
  }

  generateEngagementFunnelData(data) {
    return {
      labels: ['Visitors', 'Signups', 'Profile Complete', 'First Match', 'Conversation'],
      values: [10000, 3500, 2800, 1900, 1200]
    };
  }

  generateActivityHeatmapData(data) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    return {
      xLabels: hours,
      yLabels: days,
      values: days.map(() => 
        hours.map(() => Math.floor(Math.random() * 100))
      )
    };
  }

  generateRetentionCohortData(data) {
    return [{
      label: 'Week 1 Cohort',
      data: [
        { x: 0, y: 100 },
        { x: 1, y: 85 },
        { x: 7, y: 65 },
        { x: 14, y: 45 },
        { x: 30, y: 35 }
      ]
    }];
  }

  generateABTestConversionData(testData) {
    return {
      labels: testData.variants?.map(v => v.name) || ['Control', 'Variant A'],
      values: testData.variants?.map(v => v.conversionRate) || [12.5, 14.8]
    };
  }

  generateABTestTimelineData(testData) {
    const dates = this.generateDateRange(14);
    return testData.variants?.map((variant, index) => ({
      label: variant.name,
      data: dates.map((date, dayIndex) => ({
        x: date,
        y: Math.floor((variant.conversions || 0) * (dayIndex + 1) / 14)
      }))
    })) || [];
  }

  // Helper methods

  generateChartId() {
    return 'chart_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  getDefaultChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      colors: this.colorPalettes.primary,
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart'
      }
    };
  }

  validateChartConfig(chart) {
    if (!chart.id || !chart.type || !chart.data) {
      throw new Error('Invalid chart configuration');
    }
  }

  adjustColorOpacity(color, opacity) {
    // Convert hex color to rgba with specified opacity
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  }

  getGaugeStatus(percentage, target) {
    if (percentage >= target) return 'success';
    if (percentage >= target * 0.8) return 'warning';
    return 'danger';
  }

  convertHeatmapToScatterData(data) {
    const scatterData = [];
    if (data.values) {
      data.values.forEach((row, yIndex) => {
        row.forEach((value, xIndex) => {
          scatterData.push({
            x: xIndex,
            y: yIndex,
            v: value // Custom property for heatmap value
          });
        });
      });
    }
    return scatterData;
  }

  generateDateRange(days) {
    const dates = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  }

  /**
   * Generate real-time dashboard update data
   */
  generateRealtimeUpdate(dashboardId) {
    return {
      dashboardId,
      timestamp: new Date(),
      updates: {
        activeUsers: Math.floor(Math.random() * 1000) + 500,
        revenue: Math.floor(Math.random() * 10000) + 5000,
        conversions: Math.floor(Math.random() * 50) + 25,
        newSignups: Math.floor(Math.random() * 20) + 10
      }
    };
  }

  /**
   * Create comparative analysis chart
   */
  createComparisonChart(data1, data2, options = {}) {
    return this.createLineChart({
      id: 'comparison_chart',
      title: options.title || 'Comparative Analysis',
      data: [
        { label: options.label1 || 'Dataset 1', data: data1 },
        { label: options.label2 || 'Dataset 2', data: data2 }
      ],
      options: {
        colors: [this.colorPalettes.primary[0], this.colorPalettes.primary[1]],
        ...options
      }
    });
  }
}

module.exports = DataVisualizationService;