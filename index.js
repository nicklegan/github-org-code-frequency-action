const core = require('@actions/core')
const github = require('@actions/github')
const stringify = require('csv-stringify/lib/sync')
const arraySort = require('array-sort')
const {GitHub} = require('@actions/github/lib/utils')
const {retry} = require('@octokit/plugin-retry')
const {throttling} = require('@octokit/plugin-throttling')

const MyOctokit = GitHub.plugin(throttling, retry)
const eventPayload = require(process.env.GITHUB_EVENT_PATH)

const token = core.getInput('token', {required: true})
const org = core.getInput('org', {required: false}) || eventPayload.organization.login
const weeks = core.getInput('weeks', {required: false}) || '4'

let columnDate
let fileDate

// API throttling and retry
const octokit = new MyOctokit({
  auth: token,
  request: {
    retries: 3,
    retryAfter: 180
  },
  throttle: {
    onRateLimit: (retryAfter, options, octokit) => {
      octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`)

      if (options.request.retryCount === 0) {
        // only retries once
        octokit.log.info(`Retrying after ${retryAfter} seconds!`)
        return true
      }
    },
    onAbuseLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`)
    }
  }
})

// Retrieve code frequency data for the repo and set interval input selection
async function freqStats(repo) {
  try {
    const response = await octokit.rest.repos.getCodeFrequencyStats({
      owner: org,
      repo: repo.name
    })

    let weeksTotal
    let weeksInterval = []
    let sumArray = []
    let logDate

    weeksTotal = response.data

    const fromdate = core.getInput('fromdate', {required: false}) || ''
    const todate = core.getInput('todate', {required: false}) || ''

    const regex = '([0-9]{4}-[0-9]{2}-[0-9]{2})'
    const flags = 'i'
    const re = new RegExp(regex, flags)

    if (weeksTotal !== undefined) {
      if (weeksTotal.length > 0) {
        if (re.test(fromdate, todate) !== true) {
          weeksInterval = weeksTotal.slice(-weeks)
          columnDate = `<${weeks} weeks`
          fileDate = `${weeks}-weeks`
          logDate = `last ${weeks} weeks`
        } else {
          to = new Date(todate).getTime() / 1000
          from = new Date(fromdate).getTime() / 1000
          weeksTotal.forEach((element) => {
            if (element[0] >= from && element[0] <= to) {
              weeksInterval.push(element)
            }
            columnDate = `${fromdate} to ${todate}`
            fileDate = `${fromdate}-to-${todate}`
            logDate = `${fromdate} to ${todate}`
          })
        }

        intervalTotal = await weeksInterval.reduce((r, a) => a.map((b, i) => (r[i] || 0) + b), []).slice(1)
        alltimeTotal = await weeksTotal.reduce((r, a) => a.map((b, i) => (r[i] || 0) + b), []).slice(1)

        const additions = intervalTotal[0]
        const deletions = Math.abs(intervalTotal[1])
        const alltimeAdditions = alltimeTotal[0]
        const alltimeDeletions = Math.abs(alltimeTotal[1])
        const repoName = repo.name
        const createdDate = repo.createdAt.substr(0, 10)

        let primaryLanguage
        let allLanguages
        if (repo.primaryLanguage !== null) {
          primaryLanguage = repo.primaryLanguage.name
        }

        if (repo.languages !== null) {
          allLanguages = repo.languages.nodes.map((language) => language.name).join(', ')
        }

        console.log(
          '\n',
          'Repository:',
          repoName,
          '\n',
          `Lines added (${logDate}):`,
          additions,
          '\n',
          `Lines deleted (${logDate}):`,
          deletions,
          '\n',
          'Lines added (all time):',
          alltimeAdditions,
          '\n',
          'Lines deleted (all time):',
          alltimeDeletions,
          '\n',
          'Primary language:',
          primaryLanguage,
          '\n',
          'Languages:',
          allLanguages,
          '\n',
          'Date created:',
          createdDate
        )

        sumArray.push({repoName, additions, deletions, alltimeAdditions, alltimeDeletions, createdDate, primaryLanguage, allLanguages})

        return sumArray
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Retrieve all repos for org
;(async () => {
  try {
    let paginationMember = null
    let repoArray = []

    const query = `
      query ($owner: String!, $cursorID: String) {
        organization(login: $owner) {
          repositories(first: 100, after: $cursorID) {
            nodes {
              name
              createdAt
              primaryLanguage {
                name
              }
              languages(first:100) {
                nodes {
                  name
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `

    let hasNextPageMember = false
    let dataJSON = null

    do {
      dataJSON = await octokit.graphql({
        query,
        owner: org,
        cursorID: paginationMember
      })

      const repos = dataJSON.organization.repositories.nodes

      hasNextPageMember = dataJSON.organization.repositories.pageInfo.hasNextPage

      for (const repo of repos) {
        if (hasNextPageMember) {
          paginationMember = dataJSON.organization.repositories.pageInfo.endCursor
        } else {
          paginationMember = null
        }
      }
      repoArray = repoArray.concat(repos)
    } while (hasNextPageMember)
    await repoDirector(repoArray)
  } catch (error) {
    core.setFailed(error.message)
  }
})()

// Initiate query requests for each repo and store the promises
async function repoDirector(repoArray) {
  try {
    let githubPromise
    let promises = []
    let csvArray = []

    repoArray.forEach(async function (repo) {
      githubPromise = freqStats(repo)
      promises.push(githubPromise)
    })

    console.log(`Retrieving repository code frequency data for the ${org} organization:`)

    Promise.all(promises).then(function (repos) {
      const filteredArray = repos.filter((x) => x)

      filteredArray.forEach((element) => {
        const repoName = element[0].repoName
        const additions = element[0].additions || 0
        const deletions = element[0].deletions || 0
        const alltimeAdditions = element[0].alltimeAdditions || 0
        const alltimeDeletions = element[0].alltimeDeletions || 0
        const primaryLanguage = element[0].primaryLanguage
        const allLanguages = element[0].allLanguages
        const createdDate = element[0].createdDate

        csvArray.push({repoName, additions, deletions, alltimeAdditions, alltimeDeletions, primaryLanguage, allLanguages, createdDate})
      })

      sortpushTotals(csvArray)
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Add columns, sort and push report to repo
async function sortpushTotals(csvArray) {
  try {
    const columns = {
      repoName: 'Repository',
      additions: `Lines added (${columnDate})`,
      deletions: `Lines deleted (${columnDate})`,
      alltimeAdditions: 'All time lines added',
      alltimeDeletions: 'All time lines deleted',
      primaryLanguage: 'Primary language',
      allLanguages: 'All languages',
      createdDate: 'Repo creation date'
    }

    const sortColumn = core.getInput('sort', {required: false}) || 'additions'
    const sortArray = arraySort(csvArray, sortColumn, {reverse: true})
    sortArray.unshift(columns)

    // Convert array to csv
    const csv = stringify(sortArray, {})

    // Prepare path/filename, repo/org context and commit name/email variables
    const reportPath = `reports/${org}-${new Date().toISOString().substring(0, 19) + 'Z'}-${fileDate}.csv`
    const committerName = core.getInput('committer-name', {required: false}) || 'github-actions'
    const committerEmail = core.getInput('committer-email', {required: false}) || 'github-actions@github.com'
    const {owner, repo} = github.context.repo

    // Push csv to repo
    const opts = {
      owner,
      repo,
      path: reportPath,
      message: `${new Date().toISOString().slice(0, 10)} Git audit-log report`,
      content: Buffer.from(csv).toString('base64'),
      committer: {
        name: committerName,
        email: committerEmail
      }
    }

    console.log(`Pushing final CSV report to repository path: ${reportPath}`)

    await octokit.rest.repos.createOrUpdateFileContents(opts)
  } catch (error) {
    core.setFailed(error.message)
  }
}
