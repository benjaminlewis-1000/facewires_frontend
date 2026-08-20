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
    }

    this.props.setSource('person', default_url.url, default_url.id, -100)
  }

  handleClick(index, url, id) {
    // console.log(index, url)
    this.props.setSource('person', url, id, index)
    this.setState({ personSelected: index })
  }

  // Same filtering logic used by render(), but returned as data so
  // componentDidUpdate can check whether the current selection survived
  // a toggle change without having to duplicate the filter conditions.
  getFilteredEntries() {
    const people = this.props.people
    const only_unlabeled = this.props.unlabeled
    const only_unverified = this.props.only_unverified

    const myData = [].concat(people)
    myData.sort()
    const found_idx = myData.findIndex(element => element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned')

    const passesFilter = (value) => {
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

    const entries = this.getFilteredEntries()
    const stillPresent = entries.some(e => e.index === this.state.personSelected)
    if (stillPresent) return

    // The current selection was filtered out by the toggle change - fall
    // back to the first person still in the list (usually Unassigned).
    // If literally nothing matches the filter (e.g. every face is
    // assigned while "Only Unlabeled" is on), leave the selection alone
    // rather than forcing a pick.
    if (entries.length > 0){
      const first = entries[0]
      this.props.setSource('person', first.value.url, first.value.id, first.index)
      this.setState({ personSelected: first.index })
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
          onDragOver={console.log("drag over")}
        >
          {text}
        </button>
      </SidebarPersonContextWrapper>
    );
  }
  //

  render() {
    var only_unlabeled = this.props.unlabeled
    var only_unverified = this.props.only_unverified

    const entries = this.getFilteredEntries()
    var items = entries.map(({ index, value }) => {
      if (index === -100){
        const noOne = { ...value, person_name: 'Unassigned' }
        return this.makePerson(noOne, -100, this.state.personSelected === -100)
      }
      return this.makePerson(value, index, this.state.personSelected === index, only_unverified, only_unlabeled)
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
          {items}
        </div>

        <Menu id={SIDEBAR_PERSON_MENU_ID}>
          <Item onClick={({ props }) => this.props.onRenamePerson && this.props.onRenamePerson(props.id, props.name)}>
            Rename person
          </Item>
        </Menu>
      </div>
    );
  }
}


export default PersonSidebar;
