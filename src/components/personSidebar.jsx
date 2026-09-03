import React from 'react';
import { useContextMenu, Menu, Item } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
// import Person from './person'

const SIDEBAR_PERSON_MENU_ID = 'menu-person-sidebar';

// Functional wrapper to leverage react-contexify's hook cleanly inside
// the class component below (same pattern as lazyImg.jsx). Shares one
// Menu across every sidebar entry - which person the "Rename" item acts
// on is passed through as show()'s props and read back in the Item's
// onClick, rather than mounting a Menu per row.
function SidebarPersonContextWrapper({ id, name, children }) {
  const { show } = useContextMenu({ id: SIDEBAR_PERSON_MENU_ID });

  function handleContextMenu(event) {
    show({ event, props: { id, name } });
  }

  return (
    <span onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
      {children}
    </span>
  );
}

// update parent from child:
// https://www.codeproject.com/Tips/1215984/Update-State-of-a-Component-from-Another-in-React
class PersonSidebar extends React.Component {

  constructor(props) {
    super(props);
    // console.log(props)
    var default_url = this.props.people.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned');
    // this.props.setSource(default_url.url)
    this.state = {
      personSelected: -100,
      // Stable id of the selected person, tracked alongside the
      // display-position `personSelected` index - see componentDidUpdate,
      // which needs id (not position) to reliably tell whether the
      // selection survived a `people` array change, since removing
      // someone from the list (e.g. a merge) shifts everyone after them
      // to a different index.
      personSelectedId: default_url.id,
    }

    this.props.setSource('person', default_url.url, default_url.id, -100)
  }

  handleClick(index, url, id) {
    // console.log(index, url)
    this.props.setSource('person', url, id, index)
    this.setState({ personSelected: index, personSelectedId: id })
  }

  // Subordinate ".ignore" row ("Flagged for review") - same underlying
  // person/id/index as .ignore's own row (it's a filtered view of
  // .ignore's faces, not a different person), so local selection
  // tracking stays in sync the same way a normal click would. Actually
  // switching into that filtered view is handled by the parent
  // (onSelectReviewFlagged), since it needs to flip a flag ImageScreen's
  // fetch reads - see picasaScreen.jsx.
  handleReviewFlaggedClick(index, id) {
    this.props.onSelectReviewFlagged && this.props.onSelectReviewFlagged()
    this.setState({ personSelected: index, personSelectedId: id })
  }

  // Same filtering logic used by render(), but returned as data so
  // componentDidUpdate can check whether the current selection survived
  // a toggle change without having to duplicate the filter conditions.
  // applyFilter=false returns every entry in display order (Unassigned
  // pinned first, then the rest), regardless of the unlabeled/unverified
  // toggles - used by componentDidUpdate to walk "who comes next" even
  // for entries the current filter is hiding.
  getFilteredEntries(applyFilter = true) {
    const people = this.props.people
    const only_unlabeled = this.props.unlabeled
    const only_unverified = this.props.only_unverified

    const myData = [].concat(people)
    myData.sort()
    const found_idx = myData.findIndex(element => element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned')

    const passesFilter = (value) => {
      if (!applyFilter) return true
      // Unassigned's "unverified" count is really num_blanks (every
      // still-undeclared face, not per-face validation progress - see
      // PersonListView's BLANK_FACE_NAME special case) - it was never a
      // meaningful "verify" target. Hidden entirely here in favor of the
      // total-unverified-count label render() shows in its place - see
      // totalUnverified().
      if (only_unverified && (value.person_name === "_NO_FACE_ASSIGNED_" || value.person_name === 'Unassigned')) return false
      if (only_unlabeled && value.num_possibilities === 0) return false
      if (only_unverified && value.num_unverified_faces === 0) return false
      return true
    }

    const entries = []
    if (found_idx !== -1 && passesFilter(myData[found_idx])){
      entries.push({ index: -100, value: myData[found_idx] })
    }
    for (const [index, value] of myData.entries()) {
      if (index === found_idx) continue
      if (!passesFilter(value)) continue
      entries.push({ index, value })
    }
    return entries
  }

  componentDidUpdate(prevProps) {
    if (this.props.unlabeled === prevProps.unlabeled &&
        this.props.only_unverified === prevProps.only_unverified &&
        this.props.people === prevProps.people){
      return
    }

    // Identity check by id (not array position) - a person's index shifts
    // whenever someone earlier in the list is removed entirely (e.g. a
    // merge), which would otherwise make this spuriously match a
    // different person who happens to now sit at the old index. -100
    // (Unassigned) is a fixed sentinel rather than a real position, so
    // it's still safe to compare directly.
    const isSelected = (e) => this.state.personSelected === -100 ? e.index === -100 : e.value.id === this.state.personSelectedId
    const entries = this.getFilteredEntries()
    const stillPresent = entries.some(isSelected)
    if (stillPresent) return

    // The current selection was filtered out (typically: it was the last
    // person left under the current toggle, and finishing their last face
    // just dropped them out of the list). Rather than defaulting back to
    // the top of the sidebar, walk forward from where the selection was in
    // the full (unfiltered) display order and land on the next person who
    // still passes the current filter - wrapping around to the top only if
    // nothing further down qualifies.
    if (entries.length > 0){
      const displayOrder = this.getFilteredEntries(false)
      const prevPos = displayOrder.findIndex(isSelected)
      const stillVisible = new Set(entries.map(e => e.index === -100 ? -100 : e.value.id))

      let next = null
      if (prevPos !== -1){
        for (let step = 1; step <= displayOrder.length; step++){
          const candidate = displayOrder[(prevPos + step) % displayOrder.length]
          const candidateKey = candidate.index === -100 ? -100 : candidate.value.id
          if (stillVisible.has(candidateKey)){
            next = candidate
            break
          }
        }
      }
      // Previously-selected person no longer appears anywhere (e.g. was
      // removed rather than just filtered) - fall back to the first
      // visible entry, same as before this change.
      if (!next) next = entries[0]

      this.props.setSource('person', next.value.url, next.value.id, next.index)
      this.setState({ personSelected: next.index, personSelectedId: next.value.id })
    }
  }

  makePerson(value, index, selected, unverified, unlabeled) {
    var className = selected ? 'click-state' : 'base-state'; // this.state.id === this.props.personSelected ? 'click-state' : 'base-state';
    // console.log(this.state.id, this.props.personSelected)

    var text = ""
    // Always make the Unassigned person show the num_possibilities.
    // The other switches change values according to the toggles
    // at the top of the screen -- "only unlabeled faces" and 
    // "only unverified faces" respectively
    if (unlabeled || value.person_name === "Unassigned"){
      text = `${value.person_name}   (${value.num_possibilities})`
    }else if (unverified){
      text = `${value.person_name}   (${value.num_unverified_faces})`
    }else{
      text = `${value.person_name}   (${value.num_faces})`
    }
    return(
      <SidebarPersonContextWrapper key={index} id={value.id} name={value.person_name}>
        <button
          className={className}
          onClick = {() =>  this.handleClick(index, value.url, value.id)  }
          onDrop = {() => {console.log("Dropped on me!")}}
        >
          {text}
        </button>
      </SidebarPersonContextWrapper>
    );
  }
  // Subordinate row directly under ".ignore" - a filtered view of
  // .ignore's own possible-match faces (Face.mobile_review_hidden=True,
  // set by the mobile app's ignore-review flow when a candidate was
  // looked at but not confirmed as .ignore outright - "might actually be
  // someone"). Not a real Person, so it piggybacks on .ignore's own
  // id/index rather than getting its own sidebar entry in `people`.
  makeReviewFlaggedRow(ignoreValue, ignoreIndex) {
    const selected = this.props.reviewFlaggedOnly
    const count = ignoreValue.num_review_flagged || 0
    var className = (selected ? 'click-state' : 'base-state') + ' sidebarSubordinate'
    return (
      <button
        key={`${ignoreIndex}-flagged`}
        className={className}
        onClick={() => this.handleReviewFlaggedClick(ignoreIndex, ignoreValue.id)}
      >
        {`↳ Flagged for review   (${count})`}
      </button>
    )
  }
  // Total unverified-faces count across every real person, for the
  // "Only Unverified Faces" screen's non-clickable header label (replaces
  // the Unassigned row there - see getFilteredEntries' passesFilter).
  // Excludes Unassigned itself, whose num_unverified_faces is really
  // num_blanks (every still-undeclared face) rather than actual
  // verification progress - including it would inflate this "how much
  // is left to verify" number with faces that were never part of the
  // verify workflow to begin with.
  totalUnverified() {
    return (this.props.people || [])
      .filter(p => p.person_name !== "_NO_FACE_ASSIGNED_" && p.person_name !== 'Unassigned')
      .reduce((sum, p) => sum + (p.num_unverified_faces || 0), 0)
  }
  //

  render() {
    var only_unlabeled = this.props.unlabeled
    var only_unverified = this.props.only_unverified

    const entries = this.getFilteredEntries()
    // flatMap rather than map - .ignore's row needs to expand into two
    // rows (itself plus the subordinate "Flagged for review" row right
    // under it) without disturbing every other entry's shape.
    var items = entries.flatMap(({ index, value }) => {
      if (index === -100){
        const noOne = { ...value, person_name: 'Unassigned' }
        return [this.makePerson(noOne, -100, this.state.personSelected === -100 && !this.props.reviewFlaggedOnly)]
      }
      const rows = [this.makePerson(value, index, this.state.personSelected === index && !this.props.reviewFlaggedOnly, only_unverified, only_unlabeled)]
      // Only meaningful in unlabeled mode - the flagged faces this
      // filters to are always still-undeclared (see picasaScreen.jsx's
      // reviewFlaggedOnly reset when unlabeled is turned off).
      if (value.person_name === '.ignore' && only_unlabeled){
        rows.push(this.makeReviewFlaggedRow(value, index))
      }
      return rows
    })

    return(
      <div>
        <div
          className="sidebarList"
          id="peopleSidebar"
          // onChange = {
          //   (e) => this.props.setState(this.state.person)
          // }
         >
          {only_unverified && (
            // Non-clickable - stands in for the Unassigned row this
            // screen hides (see getFilteredEntries), since Unassigned's
            // own count isn't real verification progress.
            <div className="sidebarTotalUnverified">
              {this.totalUnverified()} unverified face{this.totalUnverified() === 1 ? '' : 's'} total
            </div>
          )}
          {items}
        </div>

        <Menu id={SIDEBAR_PERSON_MENU_ID}>
          <Item onClick={({ props }) => this.props.onRenamePerson && this.props.onRenamePerson(props.id, props.name)}>
            Rename person
          </Item>
          <Item onClick={({ props }) => this.props.onMergePerson && this.props.onMergePerson(props.id, props.name)}>
            Merge into...
          </Item>
        </Menu>
      </div>
    );
  }
}


export default PersonSidebar;
