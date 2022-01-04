import {promises as fs} from 'fs';
import parse from 'mdast-util-from-markdown';
import find from 'unist-util-find';
import zone from 'mdast-zone';
import headingRange from 'mdast-util-heading-range';
import {Given, Then} from '@cucumber/cucumber';
import {assert} from 'chai';
import any from '@travi/any';
import {questionNames} from '../../../../src/prompts/question-names';

function getBadgesFromZone(tree, badgeGroupName) {
  let badges;

  zone(tree, `${badgeGroupName}-badges`, (start, nodes, end) => {
    badges = nodes.map(node => node.children).reduce((acc, badgeList) => ([...acc, ...badgeList]), []);

    return [start, nodes, end];
  });
  return badges;
}

function groupBadges(tree) {
  const groups = {};

  ['status', 'consumer', 'contribution'].forEach(badgeGroupName => {
    const badges = getBadgesFromZone(tree, badgeGroupName);

    groups[badgeGroupName] = Object.fromEntries(badges.map(badge => ([badge.label, badge])));
  });

  return groups;
}

function assertTitleIsIncluded(readmeTree, projectName) {
  const title = readmeTree.children[0];
  const titleText = title.children[0];

  assert.equal(title.type, 'heading');
  assert.equal(title.depth, 1);
  assert.equal(titleText.type, 'text');
  assert.equal(titleText.value, projectName);
}

function assertDescriptionIsIncluded(readmeTree, projectDescription) {
  const description = readmeTree.children[1];
  const descriptionText = description.children[0];

  assert.equal(description.type, 'paragraph');
  assert.equal(descriptionText.type, 'text');
  assert.equal(descriptionText.value, projectDescription);
}

function assertBadgesSectionExists(tree, badgeSection) {
  assert.isDefined(find(tree, {type: 'html', value: `<!--${badgeSection}-badges start -->`}));
}

function assertGroupContainsBadge(badgeGroup, references, badgeDetails) {
  const badgeFromGroup = badgeGroup[badgeDetails.link ? badgeDetails.label : badgeDetails.imageReferenceLabel];
  const imageReference = badgeDetails.link ? badgeFromGroup.children[0] : badgeFromGroup;

  assert.equal(imageReference.type, 'imageReference');
  assert.equal(imageReference.label, badgeDetails.imageReferenceLabel);
  assert.equal(imageReference.alt, badgeDetails.imageAltText);
  assert.equal(references[badgeDetails.label], badgeDetails.link ? badgeDetails.link : undefined);
  assert.equal(references[badgeDetails.imageReferenceLabel], badgeDetails.imageSrc);
}

function assertGroupDoesNotContainBadge(badgeGroup, references, {label, imageReferenceLabel}) {
  assert.isUndefined(badgeGroup[label]);
  assert.isUndefined(references[label]);
  assert.isUndefined(references[imageReferenceLabel]);
}

function assertResultingBadgesInBadgeGroup(resultingSectionBadges, badgeGroup, references) {
  Object.entries(resultingSectionBadges).forEach(([badgeName, badgeDetails]) => {
    const badgeAstDetails = {
      label: `${badgeName}-link`,
      imageReferenceLabel: `${badgeName}-badge`,
      imageAltText: badgeDetails.text,
      imageSrc: badgeDetails.img,
      link: badgeDetails.link
    };

    assertGroupContainsBadge(badgeGroup, references, badgeAstDetails);
  });
}

function assertSectionContentIsCorrect(
  readmeTree,
  headingValue,
  resultingBadges,
  references,
  resultingDocumentation,
  contentName,
  badgeGroupName
) {
  headingRange(readmeTree, {test: headingValue, ignoreFinalDefinitions: true}, (start, nodes, end) => {
    const sectionContent = {type: 'root', children: nodes};

    if (badgeGroupName) {
      const badges = getBadgesFromZone(sectionContent, badgeGroupName);

      assertResultingBadgesInBadgeGroup(
        resultingBadges[badgeGroupName],
        Object.fromEntries(badges.map(badge => ([badge.label, badge]))),
        references
      );
    }

    assert.isDefined(find(
      sectionContent,
      {type: 'paragraph', children: [{type: 'text', value: resultingDocumentation[contentName]}]}
    ));

    return [start, sectionContent, end];
  });
}

function assertTableOfContentsExists(readmeTree, resultingBadges, references, resultingDocumentation) {
  const TOC_HEADING_VALUE = 'Table of Contents';
  const TOC_CONTENT_NAME = 'toc';

  assert.isDefined(find(readmeTree, {type: 'heading', depth: 2, children: [{value: TOC_HEADING_VALUE}]}));
  assertSectionContentIsCorrect(
    readmeTree,
    TOC_HEADING_VALUE,
    resultingBadges,
    references,
    resultingDocumentation,
    TOC_CONTENT_NAME
  );
}

function assertUsageContentExists(readmeTree, resultingBadges, references, resultingDocumentation) {
  const USAGE_HEADING_VALUE = 'Usage';
  const USAGE_BADGE_GROUP_NAME = 'consumer';
  const USAGE_CONTENT_NAME = 'usage';

  assert.isDefined(find(readmeTree, {type: 'heading', depth: 2, children: [{value: USAGE_HEADING_VALUE}]}));
  assertSectionContentIsCorrect(
    readmeTree,
    USAGE_HEADING_VALUE,
    resultingBadges,
    references,
    resultingDocumentation,
    USAGE_CONTENT_NAME,
    USAGE_BADGE_GROUP_NAME
  );
}

function assertContributingContentExists(readmeTree, resultingBadges, references, resultingDocumentation) {
  const CONTRIBUTING_HEADING_VALUE = 'Contributing';
  const CONTRIBUTING_BADGE_GROUP_NAME = 'contribution';
  const CONTRIBUTING_CONTENT_NAME = 'contributing';

  assert.isDefined(find(readmeTree, {type: 'heading', depth: 2, children: [{value: CONTRIBUTING_HEADING_VALUE}]}));
  assertSectionContentIsCorrect(
    readmeTree,
    CONTRIBUTING_HEADING_VALUE,
    resultingBadges,
    references,
    resultingDocumentation,
    CONTRIBUTING_CONTENT_NAME,
    CONTRIBUTING_BADGE_GROUP_NAME
  );
}

function extractReferences(nodes) {
  return Object.fromEntries(nodes
    .filter(node => 'definition' === node.type)
    .map(node => ([node.label, node.url])));
}

Given('the language scaffolder defines documentation content', function () {
  this.setAnswerFor(questionNames.PROJECT_LANGUAGE, this.getAnswerFor(questionNames.PROJECT_LANGUAGE) || any.word());

  this.languageScaffolderResults = {
    ...this.languageScaffolderResults,
    documentation: {
      toc: any.sentence(),
      usage: any.sentence(),
      contributing: any.sentence()
    }
  };
});

Then('the README includes the core details', async function () {
  const readmeTree = parse(await fs.readFile(`${process.cwd()}/README.md`, 'utf8'));

  assertTitleIsIncluded(readmeTree, this.projectName);
  assertDescriptionIsIncluded(readmeTree, this.projectDescription);
  assertBadgesSectionExists(readmeTree, 'status');
  assertBadgesSectionExists(readmeTree, 'consumer');
  assertBadgesSectionExists(readmeTree, 'contribution');
});

Then('{string} details are included in the README', async function (visibility) {
  const readmeContent = await fs.readFile(`${process.cwd()}/README.md`, 'utf8');
  const readmeTree = parse(readmeContent);
  const badgeGroups = groupBadges(readmeTree);
  const references = extractReferences(readmeTree.children);
  const PrsWelcomeDetails = {
    label: 'PRs-link',
    imageReferenceLabel: 'PRs-badge',
    imageAltText: 'PRs Welcome',
    imageSrc: 'https://img.shields.io/badge/PRs-welcome-brightgreen.svg',
    link: 'http://makeapullrequest.com'
  };

  if ('Public' === visibility) assertGroupContainsBadge(badgeGroups.contribution, references, PrsWelcomeDetails);
  else assertGroupDoesNotContainBadge(badgeGroups.contribution, references, 'PRs-link');
});

Then('the README includes the language details', async function () {
  const readmeContent = await fs.readFile(`${process.cwd()}/README.md`, 'utf8');
  const readmeTree = parse(readmeContent);
  const badgeGroups = groupBadges(readmeTree);
  const references = extractReferences(readmeTree.children);

  Object.entries(this.languageScaffolderResults.badges).forEach(([badgeType, badges]) => {
    assertResultingBadgesInBadgeGroup(badges, badgeGroups[badgeType], references);
  });
});

Then('the language content is included in the README', async function () {
  const readmeTree = parse(await fs.readFile(`${process.cwd()}/README.md`, 'utf8'));
  const references = extractReferences(readmeTree.children);
  const {badges: resultingBadges, documentation: resultingDocumentation} = this.languageScaffolderResults;

  assertTableOfContentsExists(readmeTree, resultingBadges, references, resultingDocumentation);
  assertUsageContentExists(readmeTree, resultingBadges, references, resultingDocumentation);
  assertContributingContentExists(readmeTree, resultingBadges, references, resultingDocumentation);
});