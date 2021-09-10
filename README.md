# GitHub Organization Code Frequency Action

> A GitHub Action to generate a report that contains code frequency metrics and programming languages used per repository belonging to a GitHub organization.

## Usage

The example [workflow](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions) below runs on a monthly [schedule](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#scheduled-events) using the amount of weeks as an interval set in `action.yml` (default 4 weeks) and can also be triggered manually using a [workflow_dispatch](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#manual-events) event.

```yml
name: Code Frequency Action

on:
  workflow_dispatch:
    inputs:
      fromdate:
        description: 'Optional interval start date (format: yyyy-mm-dd)'
        required: false # Skipped if workflow dispatch input is not provided
      todate:
        description: 'Optional interval end date (format: yyyy-mm-dd)'
        required: false # Skipped if workflow dispatch input is not provided
  schedule:
    - cron: '0 0 1 * *' # Runs on the first day of the month at 00:00

jobs:
  code-frequency-report:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Get Git audit-log
        uses: nicklegan/github-org-code-frequency-action@v1.0.0
        with:
          token: ${{ secrets.ORG_TOKEN }}
          fromdate: ${{ github.event.inputs.fromdate }} # Used for workflow dispatch input
          todate: ${{ github.event.inputs.todate }} # Used for workflow dispatch input
```

## GitHub secrets

| Name                 | Value                                              | Required |
| :------------------- | :------------------------------------------------- | :------- |
| `ORG_TOKEN`          | A `repo`, `read:org`scoped [Personal Access Token] | `true`   |
| `ACTIONS_STEP_DEBUG` | `true` [Enables diagnostic logging]                | `false`  |

[personal access token]: https://github.com/settings/tokens/new?scopes=repo,read:org&description=Code+Frequency+Action 'Personal Access Token'
[enables diagnostic logging]: https://docs.github.com/en/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging 'Enabling runner diagnostic logging'

:bulb: Disable [token expiration](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/) to avoid failed workflow runs when running on a schedule.

## Action inputs

| Name              | Description                                                                              | Default                     | Options                                                                                  | Required |
| :---------------- | :--------------------------------------------------------------------------------------- | :-------------------------- | :--------------------------------------------------------------------------------------- | :------- |
| `org`             | Organization different than workflow context                                             |                             |                                                                                          | `false`  |
| `weeks`           | Amount of weeks in the past to collect data for **(weeks start on Sunday 00:00:00 GMT)** | `4`                         |                                                                                          | `false`  |
| `sort`            | Column used to sort the acquired code frequency data                                     | `additions`                 | `additions, deletions, alltimeAdditions, alltimeDeletions, primaryLanguage, createdDate` | `false`  |
| `committer-name`  | The name of the committer that will appear in the Git history                            | `github-actions`            |                                                                                          | `false`  |
| `committer-email` | The committer email that will appear in the Git history                                  | `github-actions@github.com` |                                                                                          | `false`  |

## Workflow dispatch inputs

The additional option to retrieve code frequency data using a custom date interval.
If the below fields are left empty during [workflow dispatch input](https://github.blog/changelog/2020-07-06-github-actions-manual-triggers-with-workflow_dispatch/), the default interval option of set weeks from the current date configured in `main.yml` will be used instead.

:bulb: The result data includes the weeks which have their start date **(Sunday 00:00:00 GMT)** within the set interval.

| Name                           | Value                                   | Required |
| :----------------------------- | :-------------------------------------- | :------- |
| `Optional interval start date` | A date matching the format `yyyy-mm-dd` | `false`  |
| `Optional interval end date`   | A date matching the format `yyyy-mm-dd` | `false`  |

## CSV layout

The results of the 2nd and 3rd report column will be the sum of code frequency date for the requested interval per organization repository.

| Column                   | Description                                         |
| :----------------------- | :-------------------------------------------------- |
| Repository               | Organization owned repository                       |
| Lines added (interval)   | Number of lines of code added during set interval   |
| Lines deleted (interval) | Number of lines of code deleted during set interval |
| All time lines added     | Number of lines of code added since repo creation   |
| All time lines deleted   | Number of lines of code deleted since repo creation |
| Primary language         | The primary programming language used in the repo   |
| All languages            | All programming languages used in the repo          |
| Repo creation date       | Date the repo has been created                      |

A CSV report file to be saved in the repository `reports` folder using the following naming format: `organization-date-interval.csv`.

## GitHub App installation authentication

For large enterprise organizations to avoid hitting the 5000 requests per hour authenticated GitHub API rate limit, [authenticating as a GitHub App installation](https://docs.github.com/developers/apps/building-github-apps/authenticating-with-github-apps#authenticating-as-an-installation) instead would increase the [API request limit](https://docs.github.com/developers/apps/building-github-apps/rate-limits-for-github-apps#github-enterprise-cloud-server-to-server-rate-limits) in comparison to using a personal access token.

The authentication strategy can be integrated with the Octokit library by installing and configuring the [@octokit/auth-app](https://github.com/octokit/auth-app.js/#usage-with-octokit) npm module and [rebuild](https://docs.github.com/actions/creating-actions/creating-a-javascript-action) the Action in a separate repository.
