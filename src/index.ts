#!/usr/bin/env node

/**
 * WHM Mini - Lightweight CI/CD Health Monitor
 * Quick status checks without the overhead
 */

import axios from 'axios';
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('whm-mini')
  .description('Lightweight CI/CD health monitor - quick status checks')
  .version('1.0.0');

program
  .requiredOption('-p, --platform <platform>', 'CI/CD platform (github, gitlab)')
  .requiredOption('-t, --token <token>', 'API token')
  .requiredOption('-o, --owner <owner>', 'Repository owner')
  .requiredOption('-r, --repo <repo>', 'Repository name')
  .action(async (options) => {
    try {
      console.log(chalk.cyan('⚡ WHM Mini'));
      
      let status = 'unknown';
      let successRate = 0;
      let duration = 'N/A';
      let lastRun = 'N/A';

      if (options.platform === 'github') {
        const response = await axios.get(
          `https://api.github.com/repos/${options.owner}/${options.repo}/actions/runs`,
          {
            headers: {
              'Authorization': `Bearer ${options.token}`,
              'Accept': 'application/vnd.github+json',
            },
            params: { per_page: 1 },
          }
        );

        const runs = response.data.workflow_runs || [];
        if (runs.length > 0) {
          const latest = runs[0];
          status = latest.conclusion === 'success' ? 'pass' : 'fail';
          duration = formatDuration(calculateDuration(latest.run_started_at, latest.updated_at));
          lastRun = new Date(latest.updated_at).toLocaleDateString();
          
          // Get success rate from last 10 runs
          const allRunsResponse = await axios.get(
            `https://api.github.com/repos/${options.owner}/${options.repo}/actions/runs`,
            {
              headers: {
                'Authorization': `Bearer ${options.token}`,
                'Accept': 'application/vnd.github+json',
              },
              params: { per_page: 10 },
            }
          );
          const allRuns = allRunsResponse.data.workflow_runs || [];
          const successful = allRuns.filter((r: any) => r.conclusion === 'success').length;
          successRate = Math.round((successful / allRuns.length) * 100);
        }
      } else if (options.platform === 'gitlab') {
        const projectId = encodeURIComponent(`${options.owner}/${options.repo}`);
        const response = await axios.get(
          `https://gitlab.com/api/v4/projects/${projectId}/pipelines`,
          {
            headers: { 'PRIVATE-TOKEN': options.token },
            params: { per_page: 1 },
          }
        );

        const pipelines = response.data || [];
        if (pipelines.length > 0) {
          const latest = pipelines[0];
          status = latest.status === 'success' ? 'pass' : latest.status === 'failed' ? 'fail' : 'running';
          duration = formatDuration(calculateDuration(latest.created_at, latest.updated_at));
          lastRun = new Date(latest.updated_at).toLocaleDateString();

          const allResponse = await axios.get(
            `https://gitlab.com/api/v4/projects/${projectId}/pipelines`,
            {
              headers: { 'PRIVATE-TOKEN': options.token },
              params: { per_page: 10 },
            }
          );
          const allPipelines = allResponse.data || [];
          const successful = allPipelines.filter((p: any) => p.status === 'success').length;
          successRate = Math.round((successful / allPipelines.length) * 100);
        }
      }

      // Output
      const statusColor = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';
      const statusIcon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '⟳';
      
      console.log(`\n${chalk[statusColor].bold(`  ${statusIcon} ${status.toUpperCase()}`)}`);
      console.log(`  Success: ${chalk.green(`${successRate}%`)}`);
      console.log(`  Duration: ${duration}`);
      console.log(`  Last run: ${lastRun}\n`);

    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

function calculateDuration(start: string, end?: string): number {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  return Math.floor((endTime - startTime) / 1000);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
